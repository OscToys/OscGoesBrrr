import {Service} from "typedi";
import {Config, getDefaultOutput, OutputConfig} from "../../common/configTypes";
import fs from "fs/promises";
import path from "path";
import {app} from "electron";
import isFileMissingError from "../../common/isFileMissingError";
import {importLegacyLinks as importVrchatLinks} from '../../plugins/vrchat/main/legacyLinks';
import {importLegacyLinks as importAudioLinks} from '../../plugins/audio/main/legacyLinks';
import {importLegacyLinks as importConstantLinks} from '../../plugins/constant/main/legacyLinks';
import type {LegacyLinkOptions} from './LegacyLinkOptions';

@Service()
export default class LegacyTxtConfigImportService {
    static readonly IMPORTED_ID_PREFIX = "intiface.imported.";
    static readonly IMPORTED_ALL_ID = "intiface.imported.all";
    private readonly oldSavePath = path.join(app.getPath('userData'), 'config.txt');

    async migrateFromLegacy(): Promise<Config | undefined> {
        let data: string;
        try {
            data = await fs.readFile(this.oldSavePath, "utf-8");
        } catch (error) {
            if (isFileMissingError(error)) {
                console.log("No old config found, starting fresh.");
                return undefined;
            }
            throw error;
        }
        console.log("Migrating old config.txt to config.json");

        const newConfig: Config = {
            version: 3,
            useOscQuery: true,
            useIntifaceMdns: false,
            oscProxy: [],
            outputs: []
        };
        let legacyIntifaceWss = false;
        let legacyAudioMultiplier = 0;
        const legacyGlobalDeviceProps = new Map<string, string>();
        const outputDeviceProps = new Map<string, Map<string, string>>();

        for (let line of data.split("\n")) {
            line = line.trim();
            if (line.startsWith("/") || line.startsWith("#") || !line) continue;
            const split = line.split("=", 2);
            const key = split[0]!.trim();
            const value = (split.length > 1 ? split[1]! : "").trim();

            if (key === "bio.port") {
                if (value) newConfig.intifaceAddress = value;
            } else if (key === "bio.wss") {
                this.parseLegacyBool(value, parsed => legacyIntifaceWss = parsed);
            } else if (key === "audio") {
                this.parseNum(value, parsed => legacyAudioMultiplier = parsed);
            } else if (key === "maxLevelParam") {
                newConfig.maxLevelParam = value;
            } else if (key === "osc.proxy") {
                const parsed = this.parseLegacyOscProxyTargets(value);
                if (parsed.length > 0) newConfig.oscProxy = parsed;
            } else if (key === "vrcConfigDir") {
                newConfig.vrcConfigDir = value;
            } else if (key.startsWith("all.")) {
                const subkey = key.substring(4);
                legacyGlobalDeviceProps.set(subkey, value);
            } else {
                const lastDotIndex = key.lastIndexOf(".");
                if (lastDotIndex === -1) continue;
                const outputId = key.substring(0, lastDotIndex);
                const subkey = key.substring(lastDotIndex + 1);

                let props = outputDeviceProps.get(outputId);
                if (!props) {
                    props = new Map<string, string>();
                    outputDeviceProps.set(outputId, props);
                }
                props.set(subkey, value);
            }
        }

        const outputsMap = new Map<string, OutputConfig>();
        if (legacyGlobalDeviceProps.size > 0 || legacyAudioMultiplier > 0) {
            const parsed = this.parseLegacyOutput(
                LegacyTxtConfigImportService.IMPORTED_ALL_ID,
                legacyGlobalDeviceProps,
                legacyAudioMultiplier,
            );
            if (parsed) outputsMap.set(parsed.id, parsed);
        }
        for (const [outputId, props] of outputDeviceProps.entries()) {
            const mergedProps = new Map<string, string>([...legacyGlobalDeviceProps, ...props]);
            const parsed = this.parseLegacyOutput(
                `${LegacyTxtConfigImportService.IMPORTED_ID_PREFIX}${outputId}`,
                mergedProps,
                legacyAudioMultiplier,
            );
            if (parsed) outputsMap.set(parsed.id, parsed);
        }

        if (newConfig.intifaceAddress) {
            const raw = newConfig.intifaceAddress.trim();
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
                try {
                    const parsed = new URL(raw);
                    parsed.protocol = legacyIntifaceWss ? "wss:" : "ws:";
                    newConfig.intifaceAddress = parsed.toString();
                } catch {
                    // Leave as-is; ConfigService normalization handles invalid values.
                }
            } else {
                newConfig.intifaceAddress = `${legacyIntifaceWss ? "wss" : "ws"}://${raw}`;
            }
        }

        newConfig.outputs = Array.from(outputsMap.values());
        return newConfig;
    }

    private parseLegacyOutput(id: string, props: Map<string, string>, legacyAudioMultiplier: number): OutputConfig | undefined {
        const out: OutputConfig = {id, ...getDefaultOutput()};
        let type: string = 'all';
        let include: string[] = [];
        let bindKeys: string[] = [];
        let touchSelf = false;
        let touchOthers = true;
        let selfDepth = false;
        let othersDepth = true;
        let frotOthers = true;
        let motionBased = false;
        let idleLevel = 0;
        let scale = 1;

        for (const [key, value] of props.entries()) {
            switch (key) {
                case "id":
                    include = this.splitCsvTrimUnique(value);
                    continue;
                case "key":
                    bindKeys = this.splitCsvTrimUnique(value);
                    continue;
                case "type":
                    type = value;
                    continue;
                case "maxv":
                case "maxa":
                case "durationMult":
                case "restingPos":
                case "restingTime":
                case "min":
                case "max":
                    this.parseNum(value, parsed => {
                        out.linear = out.linear ?? {};
                        out.linear[key] = parsed;
                    });
                    continue;
                case "linear":
                    this.parseLegacyBool(value, parsed => motionBased = !parsed);
                    continue;
                case "updatesPerSecond":
                    this.parseNum(value, parsed => out.updatesPerSecond = parsed);
                    continue;
                case "idle":
                    this.parseNum(value, parsed => idleLevel = parsed);
                    continue;
                case "scale":
                    this.parseNum(value, parsed => scale = parsed);
                    continue;
                case "touchSelf":
                    this.parseLegacyBool(value, parsed => touchSelf = parsed);
                    continue;
                case "touchOthers":
                    this.parseLegacyBool(value, parsed => touchOthers = parsed);
                    continue;
                case "penSelf":
                    this.parseLegacyBool(value, parsed => selfDepth = parsed);
                    continue;
                case "penOthers":
                    this.parseLegacyBool(value, parsed => othersDepth = parsed);
                    continue;
                case "frotOthers":
                    this.parseLegacyBool(value, parsed => frotOthers = parsed);
                    continue;
                default:
                    continue;
            }
        }

        if (scale <= 0) return undefined;

        const options: LegacyLinkOptions = {
            type,
            include,
            bindKeys,
            touchSelf,
            touchOthers,
            selfDepth,
            othersDepth,
            frotOthers,
            motionBased,
            idleLevel,
            scale,
            legacyAudioMultiplier,
        };
        const links = [
            ...importVrchatLinks(options),
            ...importAudioLinks(options),
            ...importConstantLinks(options),
        ];
        out.links = links;

        return out;
    }

    private splitCsvTrimUnique(raw: string): string[] {
        return Array.from(new Set(raw.split(",").map(v => v.trim()).filter(v => v.length > 0)));
    }

    private parseLegacyOscProxyTargets(raw: string): string[] {
        return this.splitCsvTrimUnique(raw).map((value) => /^\d+$/.test(value) ? `localhost:${value}` : value);
    }

    private parseNum(raw: string, setter: (value: number) => void): void {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) setter(parsed);
    }

    private parseLegacyBool(raw: string, setter: (value: boolean) => void): void {
        if (raw === "true" || raw === "1") {
            setter(true);
            return;
        }
        if (raw === "false" || raw === "0") {
            setter(false);
        }
    }

}

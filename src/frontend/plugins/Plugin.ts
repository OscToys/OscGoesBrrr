import type {ComponentType, ReactNode} from 'react';
import type {Atom, PrimitiveAtom} from 'jotai';
import type {AlertColor} from '@mui/material';
import type {IconDefinition} from '@fortawesome/fontawesome-common-types';
import type {
    Config,
    InputModifier,
    InputModifierKind,
    OutputLink,
    OutputLinkKind,
} from '../../common/configTypes';
import type {OutputDeviceInfo, SettingsStatePayload} from '../../common/ipcContract';

export interface OutputPresentation {
    name?: string;
    alerts: {severity: AlertColor; content: ReactNode}[];
}

export interface OutputPresentationAtoms {
    outputId: Atom<string>;
    info: Atom<OutputDeviceInfo | undefined>;
    settings: Atom<SettingsStatePayload>;
}

export interface PluginSettingsProps {
    configAtom: PrimitiveAtom<Config>;
}

export interface LinkEditorProps {
    linkAtom: PrimitiveAtom<OutputLink>;
}

export interface LinkDefinition {
    kind: OutputLinkKind;
    label: string;
    order: number;
    create(): OutputLink;
    summary(link: OutputLink): string;
    Editor?: ComponentType<LinkEditorProps>;
    modifiers?: {
        kinds: readonly InputModifierKind[];
        get(link: OutputLink): InputModifier[];
        set(link: OutputLink, modifiers: InputModifier[]): OutputLink;
    };
}

export interface PluginPage {
    id: string;
    label: string;
    icon: IconDefinition;
    Component: ComponentType;
}

export interface FrontendPlugin {
    Settings?: ComponentType<PluginSettingsProps>;
    Runtime?: ComponentType;
    links?: readonly LinkDefinition[];
    pages?: readonly PluginPage[];
    outputPresentation?(atoms: OutputPresentationAtoms): Atom<OutputPresentation | undefined>;
    navigation?: readonly {id: string; label: string; icon: IconDefinition; href: string}[];
}

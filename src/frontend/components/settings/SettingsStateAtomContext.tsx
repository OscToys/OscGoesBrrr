import React from "react";
import type {PrimitiveAtom} from "jotai";
import type {SettingsStatePayload} from "../../../common/ipcContract";

const SettingsStateAtomContext = React.createContext<PrimitiveAtom<SettingsStatePayload> | null>(null);

export function SettingsStateAtomProvider({
    atom,
    children,
}: {
    atom: PrimitiveAtom<SettingsStatePayload>;
    children: React.ReactNode;
}) {
    return (
        <SettingsStateAtomContext.Provider value={atom}>
            {children}
        </SettingsStateAtomContext.Provider>
    );
}

export function useSettingsStateAtom(): PrimitiveAtom<SettingsStatePayload> {
    const atom = React.useContext(SettingsStateAtomContext);
    if (!atom) {
        throw new Error("useSettingsStateAtom must be used inside SettingsStateAtomProvider");
    }
    return atom;
}

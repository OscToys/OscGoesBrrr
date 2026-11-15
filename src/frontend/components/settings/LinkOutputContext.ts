import {createContext} from 'react';
import {atom, type Atom} from 'jotai';

// Link plugins consume output capabilities without knowing the output plugin.
export const LinearOutputContext = createContext<Atom<boolean>>(atom(false));

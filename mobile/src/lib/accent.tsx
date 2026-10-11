import { createContext, useContext } from 'react';

import { ACCENTS, type Accent } from './theme';

// Dükkân sayfası kendi rengini sağlar; uygulamanın geri kalanı varsayılan turkuazı kullanır.
const AccentContext = createContext<Accent>(ACCENTS[0]);

export const AccentProvider = AccentContext.Provider;

export const useAccent = () => useContext(AccentContext);

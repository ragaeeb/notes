import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'notes-theme';

const getInitialTheme = (): Theme => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useTheme = () => {
    const [theme, setTheme] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);

    const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

    return { theme, toggle } as const;
};

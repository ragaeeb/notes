const Footer = () => {
    return (
        <footer className="border-slate-700 border-t py-3 text-center text-slate-400 text-xs">
            v{__APP_VERSION__} ·{' '}
            <a
                className="underline decoration-slate-500 underline-offset-2 hover:text-slate-200"
                href="https://github.com/ragaeeb/notes"
                rel="noopener noreferrer"
                target="_blank"
            >
                GitHub
            </a>
        </footer>
    );
};

export default Footer;

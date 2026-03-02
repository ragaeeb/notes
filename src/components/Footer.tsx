const Footer = () => {
    return (
        <footer className="border-slate-700 border-t py-3 text-center text-slate-400 text-xs">
            v{__APP_VERSION__} · Inspired by{' '}
            <a
                className="underline decoration-slate-500 underline-offset-2 hover:text-slate-200"
                href="https://github.com/taqui-786/inkash"
                rel="noreferrer"
                target="_blank"
            >
                inkash
            </a>
        </footer>
    );
};

export default Footer;

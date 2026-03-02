const Footer = () => {
    return (
        <footer className="border-edge border-t py-3 text-center text-fg-dim text-xs">
            <a
                className="underline decoration-fg-faint underline-offset-2 hover:text-fg-2"
                href="https://github.com/ragaeeb/notes"
                rel="noopener noreferrer"
                target="_blank"
            >
                Notes
            </a>
            · v{__APP_VERSION__}
        </footer>
    );
};

export default Footer;

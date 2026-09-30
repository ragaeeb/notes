// Frozen content inputs. No dependencies on the codec or the evolving project README.
// These text inputs reproduce the original 14 + 8 development cases; Lexical exports
// must be obtained with export-fixtures.ts before claiming historical AST equivalence.
import { readFileSync } from 'node:fs';
export type SourceFixture = { id: string; name: string; set: 'development' | 'evaluation'; kind: 'plain' | 'markdown' | 'styled'; text: string };
const prose = [
    'The train arrived early, so Maya walked to the river before the meeting. She carried a notebook, a blue scarf, and the address of a cafe she had never visited.',
    'At the next table, two engineers compared their sketches. One wanted a faster system; the other wanted a system that would still make sense when someone else had to repair it.',
    'They agreed to start with the smallest useful experiment, record the results, and keep the original design until the evidence showed a better route.',
    'Outside, the rain stopped. The shopkeeper opened the windows, and the smell of fresh bread drifted across the square. Nobody seemed in a hurry that morning.',
    'Before leaving, Maya wrote down three questions: what do we need to preserve, what can we safely omit, and how will we know the result is correct?',
];
const rich = '# Project notes\n\nPlease keep the **bold**, *italic*, and `inline code` text.\n\n- Review the design\n- Check [the documentation](https://example.com/docs?version=2)\n- Ship a measured improvement\n\n1. Keep old links working\n2. Preserve formatting\n\n> A short quotation with punctuation.\n\n```ts\nconst greeting = "Hello, world!";\nconsole.log(greeting);\n```';
const sourceFile = (name: string): string => readFileSync(new URL(`../../docs/implementation/fixtures/source/${name}`, import.meta.url), 'utf8');
export const developmentSources = (): SourceFixture[] => {
    let seed = 123456;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const token = (): string => Array.from({ length: 48 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return alphabet[seed >>> 26];
    }).join('');
    // The order of these calls is part of the original fixture definition.
    const varied = Array.from({ length: 100 }, (_, i) => `Note ${i + 1}: ${prose[i % prose.length]} Reference ${token()}.`).join('\n');
    const unique = Array.from({ length: 100 }, token).join('\n');
    const rows: [string, SourceFixture['kind'], string][] = [
        ['Empty', 'plain', ''], ['Two characters', 'plain', 'Hi'], ['Short English', 'plain', 'Hello world'],
        ['Task note', 'plain', 'Meet Alex at 3pm. Bring the notes and confirm the room.'],
        ['Whitespace and escapes', 'plain', '  leading and trailing  \n\n"quoted" \\ slash\t tab\n\n'],
        ['Five prose paragraphs', 'plain', prose.join('\n')],
        ['Arabic', 'plain', 'هذا نص عربي للاختبار، نحافظ فيه على الكلمات والتشكيل وعلامات الترقيم.\nالهدف هو مشاركة الملاحظات دون خادم، مع الحفاظ على التنسيق واتجاه الكتابة.'],
        ['Emoji and mixed Unicode', 'plain', 'Meeting notes 📝: ship it 🚀, celebrate 🎉, then rest ☕.\n日本語のメモ。 مرحباً بالعالم. Cafe\u0301 and café are different sequences.'],
        ['Small rich document', 'markdown', rich], ['README rich', 'markdown', sourceFile('README.md')],
        ['README plain', 'plain', sourceFile('README.md')], ['100 varied paragraphs', 'plain', varied],
        ['100 unique tokens', 'plain', unique], ['Styled rich document', 'styled', rich],
        ['Follow-up Arabic', 'plain', 'موعد المكتبة غداً الساعة التاسعة صباحاً.\nأحضر الكتاب والقلم، وسجّل الأسئلة قبل اللقاء.'],
        ['Cyrillic', 'plain', 'Завтра мы обсудим новый проект. Сохраните заметки и проверьте ссылки перед встречей.'],
        ['Japanese', 'plain', '明日の会議は午前十時です。資料を確認して、質問をノートに書いてください。'],
        ['Hebrew', 'plain', 'הפגישה מחר בבוקר. נא להביא את המחברת ולבדוק את הקישורים לפני הפגישה.'],
        ['Escapes and controls', 'plain', "\uFEFF~%20 ._-/?:@&=+$#[]!'()*\u0000\u001b\t\n\nlast\n"],
        ['Unicode extremes', 'plain', '\u0001\u007f\u0080ée\u0301\u200f العربية\uFEFF\u{10000}\u{10ffff} 👩🏽‍💻'],
        ['Unpaired surrogates', 'plain', 'high \ud800 low \udfff'],
        ['Rich follow-up', 'markdown', '# Café\n\nKeep **this 🧪** and *e\u0301* intact.\n\n> Compare ~ with %20.\n\n- One\n- [Two](https://example.org/a?q=3#part)'],
    ];
    return rows.map(([name, kind, text], i) => ({ id: `dev-${String(i + 1).padStart(2, '0')}`, name, kind, text, set: 'development' }));
};
export const evaluationSources = (): SourceFixture[] => JSON.parse(readFileSync(new URL('../../tests/fixtures/evaluation-sources.json', import.meta.url), 'utf8'));

import re
from pathlib import Path
text = Path('src/components/Layout/Layout.tsx').read_text()
text = re.sub(r"'(?:[^'\\]|\\.)*'", "''", text)
text = re.sub(r'"(?:[^"\\]|\\.)*"', '""', text)
text = re.sub(r'`(?:[^`\\]|\\.)*`', '``', text)
text = re.sub(r'//.*', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
brace = 0
for i, line in enumerate(text.splitlines(), 1):
    brace += line.count('{') - line.count('}')
    if brace < 0:
        print('negative brace at', i)
        break
else:
    print('final brace count', brace)

import {language} from './i18n.js';

function _desktopNameValue(name) {
  return String(name || '').replace(/\\/g, '\\\\').replace(/[\r\n]/g, ' ');
}

export function replaceDesktopName(contents, name) {
  const lines = String(contents).split('\n');
  const start = lines.findIndex(line => line.trim() === '[Desktop Entry]');
  if (start < 0)
    return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.*\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const value = _desktopNameValue(name);
  let nameIndex = -1;
  let localeIndex = -1;
  for (let i = start + 1; i < end; i++) {
    if (nameIndex < 0 && /^\s*Name=/.test(lines[i]))
      nameIndex = i;
    if (localeIndex < 0 && lines[i].startsWith(`Name[${language()}]=`))
      localeIndex = i;
  }

  if (nameIndex < 0) {
    lines.splice(start + 1, 0, `Name=${value}`);
    nameIndex = start + 1;
    end++;
  } else {
    lines[nameIndex] = `Name=${value}`;
  }

  if (localeIndex < 0)
    lines.splice(nameIndex + 1, 0, `Name[${language()}]=${value}`);
  else
    lines[localeIndex] = `Name[${language()}]=${value}`;

  // Regional English translations otherwise shadow the user's renamed Name.
  if (language() === 'en') {
    for (let i = start + 1; i < lines.length; i++) {
      if (i > start + 1 && /^\s*\[/.test(lines[i]))
        break;
      if (/^Name\[en(?:[_@.][^\]]+)?\]=/.test(lines[i]))
        lines[i] = `${lines[i].split('=')[0]}=${value}`;
    }
  }

  return lines.join('\n');
}

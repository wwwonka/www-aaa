type LogFn = (...args: unknown[]) => void;

/**
 * Returns a styled console.log bound to a named tag. Call sites stay clean —
 * all the %c noise lives here. Never imported in prod (see contextDetect.ts).
 */
export function createLogger(tag: string, bg: string, fg = '#fff'): LogFn {
  const tagStyle = `color:${fg};background:${bg};padding:2px 6px;border-radius:4px;font-weight:700`;
  const prefix = [`%c${tag}%c`, tagStyle, ''];
  return (...args) => console.log(...prefix, ...args);
}

/** Returns a styled console.groupCollapsed/row helper bound to a named tag, for structured DEV logs. */
export function createGroupLogger(tag: string, bg: string, fg = '#fff') {
  const tagStyle = `color:${fg};background:${bg};padding:2px 6px;border-radius:4px;font-weight:700`;

  return {
    group: (label: string) => console.groupCollapsed(`%c${tag}%c ${label}`, tagStyle, ''),
    groupEnd: () => console.groupEnd(),
    row: (name: string, value: unknown, nameWidth = 0) => {
      const padded = nameWidth ? name.padEnd(nameWidth) : name;
      console.log(
        `%c${padded}%c  ${value}`,
        'color:#999',
        value ? 'color:#2ecc71;font-weight:700' : 'color:#777',
      );
    },
  };
}

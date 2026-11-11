import { Fragment } from 'react';
import { Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/app-text';

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'boldItalic'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'underline'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'code'; value: string };

const INLINE_PATTERN = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|__[^_]+?__|(?<!\*)\*[^*\n]+?\*(?!\*)|`[^`]+?`)/g;

function tokenizeInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', value: line.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('***') && raw.endsWith('***')) {
      tokens.push({ kind: 'boldItalic', value: raw.slice(3, -3) });
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ kind: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('__') && raw.endsWith('__')) {
      tokens.push({ kind: 'underline', value: raw.slice(2, -2) });
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push({ kind: 'code', value: raw.slice(1, -1) });
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push({ kind: 'italic', value: raw.slice(1, -1) });
    } else {
      tokens.push({ kind: 'text', value: raw });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ kind: 'text', value: line.slice(lastIndex) });
  }
  return tokens;
}

function renderInlineTokens(tokens: InlineToken[], baseStyle?: StyleProp<TextStyle>, keyPrefix = 't') {
  return tokens.map((tok, i) => {
    const k = `${keyPrefix}_${i}`;
    if (tok.kind === 'boldItalic') {
      return (
        <Text key={k} style={[baseStyle, styles.boldItalic]}>
          {tok.value}
        </Text>
      );
    }
    if (tok.kind === 'bold') {
      return (
        <Text key={k} style={[baseStyle, styles.bold]}>
          {tok.value}
        </Text>
      );
    }
    if (tok.kind === 'underline') {
      return (
        <Text key={k} style={[baseStyle, styles.underline]}>
          {tok.value}
        </Text>
      );
    }
    if (tok.kind === 'italic') {
      return (
        <Text key={k} style={[baseStyle, styles.italic]}>
          {tok.value}
        </Text>
      );
    }
    if (tok.kind === 'code') {
      return (
        <Text key={k} style={[baseStyle, styles.code]}>
          {tok.value}
        </Text>
      );
    }
    return (
      <Text key={k} style={baseStyle}>
        {tok.value}
      </Text>
    );
  });
}

export function MarkdownText({
  content,
  style,
}: {
  content: string;
  style?: StyleProp<TextStyle>;
}) {
  const lines = String(content || '').split(/\r?\n/);

  return (
    <Text style={style}>
      {lines.map((rawLine, idx) => {
        const isLast = idx === lines.length - 1;
        const trimmed = rawLine.trim();
        const headingMatch = trimmed.match(/^#{1,4}\s+(.*)$/);
        const bulletMatch = rawLine.match(/^\s*[-*•]\s+(.*)$/);

        let contentNode;
        if (headingMatch) {
          contentNode = renderInlineTokens(tokenizeInline(headingMatch[1]), [style, styles.heading], `h${idx}`);
        } else if (bulletMatch) {
          contentNode = (
            <>
              <Text style={[style, styles.bulletDot]}>•  </Text>
              {renderInlineTokens(tokenizeInline(bulletMatch[1]), style, `b${idx}`)}
            </>
          );
        } else {
          contentNode = renderInlineTokens(tokenizeInline(rawLine), style, `l${idx}`);
        }

        return (
          <Fragment key={`line_${idx}`}>
            {contentNode}
            {!isLast ? '\n' : null}
          </Fragment>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  boldItalic: {
    fontWeight: '700',
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  heading: {
    fontWeight: '700',
  },
  bulletDot: {
    fontWeight: '700',
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
});


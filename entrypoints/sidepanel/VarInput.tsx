import { useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { findVariableTokens, type VariableLookup } from '../../src/domain/environment';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & {
  value: string;
  lookup: (name: string) => VariableLookup;
  reveal: boolean;
};

type Tip = { name: string; left: number; top: number };

let measureContext: CanvasRenderingContext2D | null | undefined;
function measure(font: string, text: string): number {
  if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d');
  if (!measureContext) return 0;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

function Popover({ tip, lookup, reveal }: { tip: Tip; lookup: Props['lookup']; reveal: boolean }) {
  const result = lookup(tip.name);
  const left = Math.max(8, Math.min(tip.left, window.innerWidth - 268));
  return (
    <div className="var-popover" role="tooltip" style={{ left, top: tip.top }}>
      <code className="var-popover-name">{`{{${tip.name}}}`}</code>
      {result.status === 'ok' && (
        <>
          <span className="var-popover-value">{result.secret && !reveal ? '••••••••' : result.value || <em>empty</em>}</span>
          <span className="var-popover-note">{result.environment}{result.secret && !reveal ? ' · secret (reveal in Environments)' : ''}</span>
        </>
      )}
      {result.status === 'missing' && <span className="var-popover-warn">Not defined in “{result.environment}”</span>}
      {result.status === 'noenv' && <span className="var-popover-warn">No environment selected</span>}
      {result.status === 'dynamic' && <span className="var-popover-note">Dynamic variable, not resolved by apiVU</span>}
    </div>
  );
}

/** A text input that highlights `{{variables}}` and shows their resolved value on hover. */
export function VarInput({ lookup, reveal, value, className, onMouseMove, onMouseLeave, onScroll, ...rest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const tokens = useMemo(() => findVariableTokens(value), [value]);
  const plain = rest.type === 'password';

  const sync = () => {
    const input = inputRef.current;
    const backdrop = backdropRef.current;
    const track = trackRef.current;
    if (!input || !backdrop || !track) return;
    const style = getComputedStyle(input);
    backdrop.style.font = style.font;
    backdrop.style.letterSpacing = style.letterSpacing;
    backdrop.style.padding = style.padding;
    backdrop.style.borderWidth = style.borderWidth;
    track.style.transform = `translateX(${-input.scrollLeft}px)`;
  };
  useLayoutEffect(sync);

  const handleMove = (event: MouseEvent<HTMLInputElement>) => {
    onMouseMove?.(event);
    const input = inputRef.current;
    if (!input || tokens.length === 0) { if (tip) setTip(null); return; }
    const style = getComputedStyle(input);
    const origin = input.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) - input.scrollLeft;
    const x = event.clientX - origin;
    const hit = tokens.find((token) => x >= measure(style.font, value.slice(0, token.start)) && x <= measure(style.font, value.slice(0, token.end)));
    if (!hit) { if (tip) setTip(null); return; }
    const rect = input.getBoundingClientRect();
    setTip({ name: hit.name, left: event.clientX, top: rect.bottom + 6 });
  };

  if (plain) return <input ref={inputRef} className={className} value={value} {...rest} />;

  return (
    <span className="var-input">
      <div className="var-backdrop" ref={backdropRef} aria-hidden="true">
        <span ref={trackRef} className="var-track">
          {tokens.reduce<{ nodes: ReactNode[]; at: number }>((acc, token) => {
            acc.nodes.push(value.slice(acc.at, token.start), <mark key={token.start}>{value.slice(token.start, token.end)}</mark>);
            return { nodes: acc.nodes, at: token.end };
          }, { nodes: [], at: 0 }).nodes}
          {value.slice(tokens.length ? tokens[tokens.length - 1]!.end : 0)}
        </span>
      </div>
      <input
        ref={inputRef}
        className={className}
        value={value}
        onMouseMove={handleMove}
        onMouseLeave={(event) => { onMouseLeave?.(event); setTip(null); }}
        onScroll={(event) => { onScroll?.(event); sync(); }}
        onInput={sync}
        {...rest}
      />
      {tip && <Popover tip={tip} lookup={lookup} reveal={reveal} />}
    </span>
  );
}

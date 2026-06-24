import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Annotation, Compartment, EditorState, RangeSetBuilder, StateEffect, StateField,
} from '@codemirror/state';
import {
  Decoration, EditorView, keymap, lineNumbers as cmLineNumbers, placeholder as cmPlaceholder,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';

/** Marks transactions that come from us (full-doc sync, dictation) so the change
 *  listener doesn't echo them back to the draft as user edits. */
export const External = Annotation.define<boolean>();

/** Search-match highlight layer, driven imperatively from the find bar. */
const setMatches = StateEffect.define<{ ranges: { from: number; to: number }[]; active: number }>();
const sMatch = Decoration.mark({ class: 'cm-sMatch' });
const sMatchActive = Decoration.mark({ class: 'cm-sMatchActive' });
const matchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setMatches)) {
        const b = new RangeSetBuilder<Decoration>();
        e.value.ranges.forEach((r, i) => b.add(r.from, r.to, i === e.value.active ? sMatchActive : sMatch));
        deco = b.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function makeTheme(fontPx: number, fontFamily: string, focusMode: boolean, fontWeight: number) {
  return EditorView.theme({
    '&': { height: '100%', fontSize: `${fontPx}px`, color: 'var(--text)', backgroundColor: 'transparent' },
    '.cm-scroller': { fontFamily, lineHeight: 'var(--lh-read)', overflow: 'auto' },
    '.cm-content': {
      caretColor: 'var(--text)',
      fontWeight: String(fontWeight),
      '-webkit-font-smoothing': 'antialiased',
      padding: 'var(--space-4) var(--space-4) var(--space-6)',
      ...(focusMode ? { maxWidth: 'var(--editor-max-width)', margin: '0 auto', width: '100%' } : {}),
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-gutters': {
      backgroundColor: 'var(--bg)',
      color: 'var(--text-tertiary)',
      border: 'none',
      borderRight: '1px solid var(--border)',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 var(--space-3)', minWidth: '2ch' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
    '.cm-placeholder': { color: 'var(--text-tertiary)' },
    '.cm-sMatch': { backgroundColor: 'rgba(250, 204, 21, 0.28)', borderRadius: '2px' },
    '.cm-sMatchActive': { backgroundColor: 'rgba(250, 204, 21, 0.6)', borderRadius: '2px' },
  });
}

export interface CmHandle {
  /** The live EditorView (or null before mount / after unmount). */
  readonly view: EditorView | null;
  focus(): void;
  getValue(): string;
  /** Replace the whole document programmatically (undo/redo/discard/seed). */
  setValue(text: string): void;
}

interface Props {
  initialDoc: string;
  onChange: (value: string) => void;
  lineNumbers: boolean;
  wrap: boolean;
  spellcheck: boolean;
  fontPx: number;
  fontWeight: number;
  fontFamily: string;
  focusMode: boolean;
  matches: number[];
  matchLen: number;
  activeMatch: number;
  className?: string;
}

export const CmEditor = forwardRef<CmHandle, Props>(function CmEditor(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  const lnComp = useRef(new Compartment());
  const wrapComp = useRef(new Compartment());
  const spellComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());

  // Create the view once. Content lives in CM (uncontrolled); user edits flow out
  // via onChange, programmatic changes come in via setValue/dispatch with the
  // External annotation so they don't echo back as edits.
  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: props.initialDoc,
        extensions: [
          keymap.of(defaultKeymap), // editing keys only; Ctrl+Z/S/F bubble to the app
          cmPlaceholder('Start typing…'),
          matchField,
          lnComp.current.of(props.lineNumbers ? cmLineNumbers() : []),
          wrapComp.current.of(props.wrap ? EditorView.lineWrapping : []),
          spellComp.current.of(EditorView.contentAttributes.of({ spellcheck: String(props.spellcheck) })),
          themeComp.current.of(makeTheme(props.fontPx, props.fontFamily, props.focusMode, props.fontWeight)),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            if (u.transactions.some((t) => t.annotation(External))) return;
            onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: lnComp.current.reconfigure(props.lineNumbers ? cmLineNumbers() : []) });
  }, [props.lineNumbers]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrapComp.current.reconfigure(props.wrap ? EditorView.lineWrapping : []) });
  }, [props.wrap]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: spellComp.current.reconfigure(EditorView.contentAttributes.of({ spellcheck: String(props.spellcheck) })) });
  }, [props.spellcheck]);
  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeComp.current.reconfigure(makeTheme(props.fontPx, props.fontFamily, props.focusMode, props.fontWeight)) });
  }, [props.fontPx, props.fontFamily, props.focusMode, props.fontWeight]);

  // Reflect the find bar's matches as highlight decorations and reveal the active.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ranges = props.matchLen > 0
      ? props.matches.map((from) => ({ from, to: from + props.matchLen }))
      : [];
    const active = ranges[props.activeMatch];
    view.dispatch({
      effects: [
        setMatches.of({ ranges, active: props.activeMatch }),
        ...(active ? [EditorView.scrollIntoView(active.from, { y: 'center' })] : []),
      ],
    });
  }, [props.matches, props.matchLen, props.activeMatch]);

  useImperativeHandle(ref, () => ({
    get view() { return viewRef.current; },
    focus() { viewRef.current?.focus(); },
    getValue() { return viewRef.current?.state.doc.toString() ?? ''; },
    setValue(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const old = view.state.doc.toString();
      if (old === text) return;
      // Put the caret where the text actually diverges (i.e. where the undo/redo
      // change happened) rather than at the end, so it doesn't drift away.
      let i = 0;
      const max = Math.min(old.length, text.length);
      while (i < max && old[i] === text[i]) i++;
      view.dispatch({
        changes: { from: 0, to: old.length, insert: text },
        selection: { anchor: Math.min(i, text.length) },
        annotations: External.of(true),
        scrollIntoView: true,
      });
      view.focus();
    },
  }), []);

  return <div ref={hostRef} className={props.className} />;
});

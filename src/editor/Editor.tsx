import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { t } from "../i18n";
import { useLanguage } from "../i18n/react";

interface EditorProps {
  /** Which document is shown. Changing it swaps the editor's state (text, selection, undo history). */
  docId: string;
  /** Text used to create the state the first time `docId` is shown. */
  initialValue: string;
  /** Saved states of documents that are open but not showing. Owned by the parent so it can drop closed ones. */
  store: Map<string, EditorState>;
  onChange: (value: string) => void;
  onReady: (view: EditorView | null) => void;
}

/**
 * One persistent CodeMirror view for all open documents. Each document keeps its own EditorState
 * (and therefore its own undo history and cursor) in `store` while it is in the background.
 */
export function Editor({ docId, initialValue, store, onChange, onReady }: EditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const shownId = useRef(docId);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const latest = useRef({ docId, initialValue, store });
  const createStateRef = useRef<((doc: string) => EditorState) | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
    latest.current = { docId, initialValue, store };
  });

  useEffect(() => {
    const createState = (doc: string) =>
      EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          search({ top: true }),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of(() => ({ "aria-label": t("editor.label") })),
          keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      });
    createStateRef.current = createState;

    const view = new EditorView({ parent: host.current!, state: createState(latest.current.initialValue) });
    viewRef.current = view;
    shownId.current = latest.current.docId;
    onReadyRef.current(view);
    return () => {
      onReadyRef.current(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);


  // The accessible name follows the interface language; an empty transaction makes CodeMirror re-read it.
  const language = useLanguage();
  useEffect(() => {
    viewRef.current?.dispatch({});
  }, [language]);

  // Swap documents: stash the outgoing state, restore (or create) the incoming one.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || shownId.current === docId) return;
    store.set(shownId.current, view.state);
    view.setState(store.get(docId) ?? createStateRef.current!(latest.current.initialValue));
    shownId.current = docId;
  }, [docId, store]);

  return <div className="editor-host" ref={host} />;
}

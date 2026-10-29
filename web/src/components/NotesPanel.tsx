import { useState } from 'react';
import { Pencil, StickyNote, Trash2 } from 'lucide-react';
import type { Note } from '@reno/shared';
import { useNotes, useSaveNote } from '../api/hooks.ts';
import { addedByText, formatDate } from '../lib/format.ts';
import { useHiddenIds, useUndoableDelete, withoutHidden } from '../lib/undoDelete.tsx';

import { Button, Card, EmptyState, ErrorBox, QueryState } from './ui.tsx';

const textareaClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none';

function NoteItem({ note }: { note: Note }) {
  const save = useSaveNote();
  const scheduleDelete = useUndoableDelete();
  const [draft, setDraft] = useState<string>();

  if (draft !== undefined) {
    return (
      <Card className="space-y-2 p-3">
        <label htmlFor={`note-${note.id}`} className="sr-only">
          Redigera anteckning
        </label>
        <textarea
          id={`note-${note.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          className={textareaClass}
        />
        {save.error && <ErrorBox error={save.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDraft(undefined)}>
            Avbryt
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            disabled={!draft.trim()}
            onClick={() =>
              save.mutate({ id: note.id, content: draft }, { onSuccess: () => setDraft(undefined) })
            }
          >
            Spara
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="group flex gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
        <p className="mt-1 text-xs text-muted">
          {formatDate(note.createdAt)}
          {note.updatedAt.slice(0, 16) !== note.createdAt.slice(0, 16) &&
            ` · ändrad ${formatDate(note.updatedAt)}`}
          {addedByText(note.createdByName) && ` · ${addedByText(note.createdByName)}`}
        </p>
      </div>
      <div className="flex opacity-60 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Redigera anteckning"
          onClick={() => setDraft(note.content)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="danger"
          size="sm"
          aria-label="Ta bort anteckning"
          onClick={() => scheduleDelete('note', note.id, 'Anteckningen')}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

export function NotesPanel({ owner }: { owner: { projectId?: number; roomId?: number } }) {
  const notes = useNotes(owner);
  const hidden = useHiddenIds('note');
  const save = useSaveNote();
  const [content, setContent] = useState('');

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!content.trim()) return;
          save.mutate({ ...owner, content }, { onSuccess: () => setContent('') });
        }}
      >
        <label htmlFor="new-note" className="sr-only">
          Ny anteckning
        </label>
        <textarea
          id="new-note"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Skriv en anteckning – t.ex. färgkod, mått att komma ihåg, vem du pratat med…"
          className={textareaClass}
        />
        {save.error && <ErrorBox error={save.error} />}
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={save.isPending} disabled={!content.trim()}>
            Lägg till
          </Button>
        </div>
      </form>

      <QueryState query={withoutHidden(notes, hidden)}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={<StickyNote className="size-6" />} title="Inga anteckningar ännu" />
          ) : (
            <ul className="space-y-2">
              {list.map((n) => (
                <li key={n.id}>
                  <NoteItem note={n} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}

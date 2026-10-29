import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../test/render.tsx';
import { UNDO_MS, UndoProvider, useHiddenIds, useUndoableDelete } from './undoDelete.tsx';

function List({ ids }: { ids: number[] }) {
  const scheduleDelete = useUndoableDelete();
  const hidden = useHiddenIds('expense');
  return (
    <ul>
      {ids
        .filter((id) => !hidden.has(id))
        .map((id) => (
          <li key={id}>
            Utgift {id}
            <button type="button" onClick={() => scheduleDelete('expense', id, `Utgiften ”${id}”`)}>
              Ta bort {id}
            </button>
          </li>
        ))}
    </ul>
  );
}

const setup = () =>
  renderWithProviders(
    <UndoProvider>
      <List ids={[1, 2]} />
    </UndoProvider>,
  );

describe('ångra borttagning', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('döljer posten direkt men tar inte bort den på servern förrän tiden gått ut', async () => {
    const calls = mockFetch(() => ({ status: 204 }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort 1' }));

    expect(screen.queryByText('Utgift 1')).not.toBeInTheDocument();
    expect(screen.getByText('Utgift 2')).toBeInTheDocument();
    expect(screen.getByText('Utgiften ”1” togs bort')).toBeInTheDocument();
    expect(calls).toEqual([]);

    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS - 100));
    expect(calls).toEqual([]);

    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(calls).toMatchObject([{ url: '/api/expenses/1', method: 'DELETE' }]);
    expect(screen.queryByText('Utgiften ”1” togs bort')).not.toBeInTheDocument();
  });

  it('Ångra återställer posten och inget skickas till servern', async () => {
    const calls = mockFetch(() => ({ status: 204 }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ångra' }));

    expect(screen.getByText('Utgift 1')).toBeInTheDocument();
    expect(screen.queryByText(/togs bort/)).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS * 2));
    expect(calls).toEqual([]);
  });

  it('flera borttagningar kan ångras var för sig', async () => {
    const calls = mockFetch(() => ({ status: 204 }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort 2' }));
    expect(screen.getAllByRole('button', { name: 'Ångra' })).toHaveLength(2);

    // Ångra den första (överst i listan).
    fireEvent.click(screen.getAllByRole('button', { name: 'Ångra' })[0]!);
    expect(screen.getByText('Utgift 1')).toBeInTheDocument();
    expect(screen.queryByText('Utgift 2')).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS + 100));
    expect(calls).toMatchObject([{ url: '/api/expenses/2', method: 'DELETE' }]);
  });

  it('skickar väntande borttagningar direkt när fliken stängs', async () => {
    const calls = mockFetch(() => ({ status: 204 }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort 1' }));
    expect(calls).toEqual([]);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(calls).toMatchObject([{ url: '/api/expenses/1', method: 'DELETE' }]);

    // Timern är avstängd, så det skickas inte en gång till.
    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS * 2));
    expect(calls).toHaveLength(1);
  });

  it('en post som redan är borta (404) är inget fel', async () => {
    mockFetch(() => ({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'finns inte' } },
    }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort 1' }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS + 100));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('visar ett fel och tar tillbaka posten om borttagningen misslyckas', async () => {
    mockFetch(() => ({
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'Något gick fel' } },
    }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort 1' }));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_MS + 100));

    expect(screen.getByRole('alert')).toHaveTextContent('Utgiften ”1” gick inte att ta bort.');
    expect(screen.getByText('Utgift 1')).toBeInTheDocument();
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoomListItem } from '@reno/shared';
import { mockFetch, renderWithProviders } from '../test/render.tsx';
import { ExpenseForm } from './ExpenseForm.tsx';

const room = { id: 7, name: 'Kök', spentOre: 0 } as RoomListItem;

describe('ExpenseForm', () => {
  it('skickar beloppet i öre och väljer projektets enda rum', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { id: 1 } }));
    const onDone = vi.fn();
    renderWithProviders(<ExpenseForm projectId={3} rooms={[room]} onDone={onDone} />);

    await userEvent.type(screen.getByLabelText('Vad köptes?'), 'Bänkskiva ek');
    await userEvent.type(screen.getByLabelText('Belopp (kr)'), '12 490,50');
    await userEvent.type(screen.getByLabelText('Butik / firma'), 'Byggmax');
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({
      url: '/api/projects/3/expenses',
      method: 'POST',
      body: {
        description: 'Bänkskiva ek',
        amountOre: 1_249_050,
        store: 'Byggmax',
        category: 'material',
        roomId: 7,
      },
    });
  });

  it('visar fel vid ogiltigt belopp utan att anropa servern', async () => {
    const calls = mockFetch(() => ({ status: 201 }));
    renderWithProviders(<ExpenseForm projectId={3} rooms={[]} onDone={() => {}} />);

    await userEvent.type(screen.getByLabelText('Vad köptes?'), 'Färg');
    await userEvent.type(screen.getByLabelText('Belopp (kr)'), 'tusen');
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }));

    expect(await screen.findByText(/Ange ett belopp/)).toBeInTheDocument();
    expect(screen.getByLabelText('Belopp (kr)')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('visar serverns fältfel vid rätt fält', async () => {
    mockFetch(() => ({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ogiltiga uppgifter',
          details: [{ path: 'date', message: 'Ogiltigt datum' }],
        },
      },
    }));
    const onDone = vi.fn();
    renderWithProviders(<ExpenseForm projectId={3} rooms={[]} onDone={onDone} />);

    await userEvent.type(screen.getByLabelText('Vad köptes?'), 'Färg');
    await userEvent.type(screen.getByLabelText('Belopp (kr)'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }));

    expect(await screen.findByText('Ogiltigt datum')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('laddar upp bifogat kvitto efter att utgiften sparats', async () => {
    const calls = mockFetch((url) => ({
      status: 201,
      body: url.endsWith('/expenses') ? { id: 42 } : { id: 1 },
    }));
    const onDone = vi.fn();
    const { container } = renderWithProviders(
      <ExpenseForm projectId={3} rooms={[]} onDone={onDone} />,
    );

    await userEvent.type(screen.getByLabelText('Vad köptes?'), 'Kakel');
    await userEvent.type(screen.getByLabelText('Belopp (kr)'), '500');
    const file = new File(['%PDF-1.4'], 'kvitto.pdf', { type: 'application/pdf' });
    await userEvent.upload(container.querySelector('input[type=file]') as HTMLInputElement, file);
    expect(screen.getByText('kvitto.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.map((c) => c.url)).toEqual(['/api/projects/3/expenses', '/api/attachments']);
    const form = calls[1]!.body as FormData;
    expect(form.get('expenseId')).toBe('42');
    expect(form.get('kind')).toBe('kvitto');
    expect((form.get('file') as File).name).toBe('kvitto.pdf');
  });
});

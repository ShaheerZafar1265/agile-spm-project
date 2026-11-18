import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaqAssistant } from '@/components/storefront/faq-assistant';

describe('FaqAssistant', () => {
  it('routes an ordering question about a table to the menu', async () => {
    const user = userEvent.setup();
    render(<FaqAssistant />);

    await user.click(screen.getByRole('button', { name: /ask a question/i }));
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Can I order at my table?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByText('Browse the menu to place an order for pickup, delivery or dine-in.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the menu' })).toHaveAttribute('href', '/menu');
  });

  it('answers an opening-hours question', async () => {
    const user = userEvent.setup();
    render(<FaqAssistant />);

    await user.click(screen.getByRole('button', { name: /ask a question/i }));
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'What are your opening hours?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByText('We are open all week from 12:00 to 22:00.')).toBeInTheDocument();
  });

  it('does not mistake unrelated uses of “open” for an hours question', async () => {
    const user = userEvent.setup();
    render(<FaqAssistant />);

    await user.click(screen.getByRole('button', { name: /ask a question/i }));
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Is the restaurant open source?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByText('I don’t have that answer yet. You can browse the menu or start a table booking from these pages.')).toBeInTheDocument();
  });
});

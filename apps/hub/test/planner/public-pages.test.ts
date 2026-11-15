import type { PlannerBookingPageView, PlannerRsvpPage } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { bookingPageHtml } from '../../src/planner/public-pages/booking-page';
import { rsvpPageHtml } from '../../src/planner/public-pages/rsvp-page';
import { noticePageHtml } from '../../src/planner/public-pages/shell';

const TOKEN = 'k'.repeat(43);

function invite(patch: Partial<PlannerRsvpPage> = {}): PlannerRsvpPage {
  return {
    title: 'Kitchen planning call',
    location: 'Video call',
    organiser: 'Alex',
    all_day: false,
    start_local: '2026-11-16T10:00:00',
    end_local: '2026-11-16T11:00:00',
    time_zone: 'Europe/Berlin',
    guest_name: 'Anna Keller',
    response: 'needs_action',
    note: null,
    cancelled: false,
    booking: false,
    ...patch,
  };
}

const VIEW: PlannerBookingPageView = {
  title: 'Intro call',
  description: 'A short first talk.',
  minutes: 30,
  location: 'Video call',
  host: 'Alex',
  host_time_zone: 'Europe/Berlin',
  ahead_days: 14,
};

function pressed(html: string): readonly string[] {
  return [...html.matchAll(/value="(\w+)" aria-pressed="true"/g)].map((match) => match[1] ?? '');
}

describe('the RSVP page', () => {
  it('shows the event, the organiser and three answers that post to the link itself', () => {
    const html = rsvpPageHtml(invite(), { token: TOKEN, answer: null });
    expect(html).toContain('Kitchen planning call');
    expect(html).toContain('Invitation from Alex');
    expect(html).toContain('Hi Anna Keller,');
    expect(html).toContain('Not answered yet');
    expect(html).toContain(`action="/rsvp/${TOKEN}"`);
    for (const value of ['yes', 'maybe', 'no']) {
      expect(html).toContain(`name="response" value="${value}"`);
    }
    expect(pressed(html)).toEqual([]);
  });

  it('leads with the answer from the email link, else with the saved answer', () => {
    const linked = rsvpPageHtml(invite({ response: 'yes' }), {
      token: TOKEN,
      answer: 'maybe',
    });
    expect(pressed(linked)).toEqual(['maybe']);
    expect(linked).toContain('Tap your answer once more to send it.');
    const saved = rsvpPageHtml(invite({ response: 'no' }), { token: TOKEN, answer: null });
    expect(pressed(saved)).toEqual(['no']);
    expect(saved).toContain('You said no');
  });

  it('offers only cancelling for a booking and nothing once the event is cancelled', () => {
    const booking = rsvpPageHtml(invite({ booking: true, response: 'yes' }), {
      token: TOKEN,
      answer: null,
    });
    expect(booking).toContain('Booked with Alex');
    expect(booking).toContain('Cancel the booking');
    expect(booking).not.toContain('value="maybe"');
    const cancelled = rsvpPageHtml(invite({ cancelled: true }), { token: TOKEN, answer: 'yes' });
    expect(cancelled).toContain('This event was cancelled.');
    expect(cancelled).not.toContain('<form');
  });

  it('escapes every value it shows and runs no script', () => {
    const html = rsvpPageHtml(
      invite({
        title: '<img src=x onerror=alert(1)>',
        organiser: 'A & "B"',
        location: "<script>alert('x')</script>",
        note: '</textarea><b>bold</b>',
      }),
      { token: TOKEN, answer: null },
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('A &amp; &quot;B&quot;');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/<[^>]*\son[a-z]+=/);
  });
});

describe('the booking page', () => {
  it('shows the title, host, length and place with the script under its nonce', () => {
    const html = bookingPageHtml(VIEW, 'n0nce');
    expect(html).toContain('<h1>Intro call</h1>');
    expect(html).toContain('Book a time with Alex');
    expect(html).toContain('30 min');
    expect(html).toContain('Video call');
    expect(html).toContain('data-days="14"');
    expect(html).toContain('<script nonce="n0nce">');
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/<[^>]*\son[a-z]+=/);
  });

  it('keeps the form, the days and the confirmation hidden parts on the one page', () => {
    const html = bookingPageHtml({ ...VIEW, location: null, description: '' }, 'n');
    for (const id of ['days', 'times', 'details', 'done', 'cancel', 'zone', 'status']) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).not.toContain('A short first talk.');
    expect(html).toContain('<form id="details" class="card" hidden>');
  });

  it('escapes the page fields and the nonce', () => {
    const html = bookingPageHtml(
      { ...VIEW, title: '<i>x</i>', description: '<b>y</b>', host: '"Alex"' },
      '"><script>',
    );
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&quot;Alex&quot;');
    expect(html).toContain('<script nonce="&quot;&gt;&lt;script&gt;">');
  });
});

describe('the notice page', () => {
  it('shows the heading and message in the same look, escaped', () => {
    const html = noticePageHtml('This link is no longer available', 'Ask <them>.');
    expect(html).toContain('This link is no longer available');
    expect(html).toContain('Ask &lt;them&gt;.');
    expect(html).toContain('prefers-color-scheme: dark');
  });
});

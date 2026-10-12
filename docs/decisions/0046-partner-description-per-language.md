# 0046. A partner writes its description in each language itself

> **Status:** Accepted
> **Date:** 2026-10-12
> **Deciders:** Owner
> **Amends:** [requirements.md](../requirements.md) — FR-033 and the "machine translation of partner content" exclusion, which it implements

## Context

The interface speaks English, Russian and Ukrainian, but a partner's
description was one free-text field in whatever language the partner wrote it.
A Ukrainian visitor reading an English description - or the other way round -
is a page that is translated everywhere except where it matters most. The
client reported exactly that. requirements.md already assumed partners supply
English and, optionally, Russian and Ukrainian, and already rejected machine
translation of partner content; nothing implemented it.

## Decision

- `companies.description` stays what the partner wrote first, and is required
  as before.
- `companies.description_translations` (jsonb, `{en?, ru?, uk?}`) holds the
  versions the partner added. Each is optional, at most 1000 characters, and
  blank means absent.
- Pages read the version in the visitor's locale and fall back to
  `description` (`localizedDescription`). The catalogue card, the partner page,
  its meta description and its JSON-LD all go through it.
- The application form and the staff edit in the console offer the three
  versions. No owner edit form exists yet; staff enter a partner's versions on
  request.
- Search indexes every version at the description's weight.
- Nothing is machine-translated: a partner's offer is a commercial statement
  and must be in their words.

## Consequences

- A partner who writes one language still shows that language everywhere.
- The specialization text stays single-language for now.
- Erasure and deletion need nothing new: the versions live on the company row.

## Revisit if

- Partners ask to edit their own versions after approval - then add the fields
  to the owner edit path and its moderation whitelist.

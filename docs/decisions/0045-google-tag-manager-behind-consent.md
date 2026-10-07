# 0045. Google Tag Manager runs on public pages, and only after the visitor accepts

> **Status:** Accepted
> **Date:** 2026-10-07
> **Deciders:** Owner
> **Amends:** [security.md](../security.md) — "Third-party client-side scripts: none" and the ePrivacy row

## Context

The owner wants the site measured through Google Tag Manager (container
`GTM-P9PZ5883`). Until now the site loaded no third-party script, and two
documented positions rested on that: no consent banner (there was nothing to
consent to) and a page with nothing a third party could read. GTM ends both.
Its tags set analytics and marketing cookies, which EU ePrivacy rules allow
only with prior consent. Running it inside the account, the console or a
payment form would also put members' pages and identifiers in front of a
third party.

## Decision

- **A consent banner on every page**, with equal **Accept** and **Reject**
  buttons and a link to the Cookie Policy, in en/ru/uk. The choice is stored
  in a strictly necessary cookie (`kclub_consent`, 12 months). "Cookie
  settings" in both footers brings the banner back. Withdrawing consent
  reloads the page so nothing already running continues.
- **GTM loads only after Accept** ("basic" Consent Mode). Before that no
  Google request is made at all. When it loads, Consent Mode v2 defaults
  (all denied) are pushed and then updated to granted, so the tags inside the
  container read the same answer the banner gave.
- **Never on private pages**, whatever was chosen: the account, the console,
  the dues and payment screens, sign-up, sign-in, the partner application, the
  card, password and email flows, and join and invite links
  (`analyticsAllowedOn`, unit-tested).
- No `<noscript>` iframe: a visitor without JavaScript cannot be asked, so
  nothing loads for them.

## Rationale

"Basic" mode (load nothing until accepted) rather than "advanced" mode
(cookieless pings before consent). It is the reading of the rules that
regulators have not challenged, and it costs only the measurement of people
who refuse, which is the point of refusing.

## Consequences

**This makes easy:** the owner adds and changes tags in GTM without a
deployment.

**This makes hard:** whatever is added inside the container is outside code
review. A tag that reads form fields or sends personal data is the owner's
responsibility, and the Privacy Policy's list of processors must name Google.

**We accept:** a banner on every first visit.

## Revisit if

The club wants measurement inside the account or on payment pages, or an
advertising pixel. Each of those is a new decision about members' personal
data.

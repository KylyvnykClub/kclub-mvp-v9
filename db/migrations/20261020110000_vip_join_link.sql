-- ADR 0048: a third door. A VIP join link makes a sponsored member whose first
-- card is VIP - what the owner used to do by hand after a member link.
ALTER TYPE "join_link_kind" ADD VALUE IF NOT EXISTS 'vip';

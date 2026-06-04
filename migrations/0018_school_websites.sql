-- 0018: AI-generated school marketing websites.
--
-- Each school can have one school_website row that captures:
--   - the intake answers (raw JSON, source of truth for re-generation)
--   - the AI-generated sections (hero, about, programs, etc.)
--   - a theme choice + a few brand customisations beyond the org defaults
--   - an optional custom domain (CNAME) the school owns
--
-- Public render of /schools/:slug pulls from sections_json. If a custom
-- domain points at the worker, the request is matched by Host header.

CREATE TABLE school_website (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL UNIQUE REFERENCES organization(id) ON DELETE CASCADE,
  -- Raw intake answers (JSON object with stable keys)
  intakeJson      TEXT,
  intakeUpdatedAt INTEGER,
  -- Generated sections: { hero, about, services, instructors, testimonials,
  -- faq, contact } — each an object with title + body + optional media
  sectionsJson    TEXT,
  sectionsModel   TEXT,
  sectionsGeneratedAt INTEGER,
  -- Theme. 'brand' | 'trade' | 'editorial' | 'bold'
  theme           TEXT NOT NULL DEFAULT 'brand',
  -- Public custom domain (e.g. 'mountainsidedriving.com'). When set, the
  -- worker matches the Host header against this and serves the school
  -- as its public site.
  customDomain    TEXT UNIQUE,
  customDomainVerifiedAt INTEGER,
  customDomainVerifyToken TEXT,  -- random string the school adds as a TXT
  -- Tier the website was generated under — useful for paywall gating
  tier            TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'studio' | 'pro'
  -- SEO + social
  ogImageKey      TEXT,           -- R2 key of generated OG card
  faviconKey      TEXT,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);
CREATE INDEX idx_school_website_custom_domain ON school_website(customDomain) WHERE customDomain IS NOT NULL;

-- History of generations (so we can revert)
CREATE TABLE school_website_version (
  id              TEXT PRIMARY KEY,
  websiteId       TEXT NOT NULL REFERENCES school_website(id) ON DELETE CASCADE,
  intakeJson      TEXT,
  sectionsJson    TEXT,
  model           TEXT,
  tokensIn        INTEGER,
  tokensOut       INTEGER,
  createdAt       INTEGER NOT NULL,
  createdByUserId TEXT REFERENCES user(id) ON DELETE SET NULL
);
CREATE INDEX idx_school_website_version_site ON school_website_version(websiteId, createdAt DESC);

-- School photo library. R2-backed. Used in hero, gallery, instructor bios.
-- Per-school; never shared.
CREATE TABLE school_photo (
  id              TEXT PRIMARY KEY,
  organizationId  TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  storageKey      TEXT NOT NULL,        -- R2 key
  caption         TEXT,
  altText         TEXT,
  kind            TEXT,                  -- 'hero' | 'gallery' | 'instructor' | 'stock'
  uploadedByUserId TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt       INTEGER NOT NULL
);
CREATE INDEX idx_school_photo_org ON school_photo(organizationId, kind);

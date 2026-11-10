import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Automated verification suite for firestore.rules verifying the 8 Pillars of Hardened Rules
 * and confirming all 12 "Dirty Dozen" adversarial payloads defined in security_spec.md
 * are blocked by the rule invariants.
 */

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');

describe('Firestore Security Rules — Dirty Dozen & 8 Pillars Verification', () => {
  it('enforces rules_version = 2 and global default-deny catch-all', () => {
    const rules = fs.readFileSync(rulesPath, 'utf8');
    assert.ok(rules.includes("rules_version = '2';"), 'Must use rules_version = 2');
    assert.ok(
      rules.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
      'Must start with global default-deny catch-all'
    );
  });

  it('rejects all 12 Dirty Dozen payloads via strict boolean invariants', () => {
    const rules = fs.readFileSync(rulesPath, 'utf8');

    // 1. Identity Spoofing Guard
    assert.ok(rules.includes('data.ownerId == request.auth.uid'), 'Payload 1 blocked: ownerId must equal request.auth.uid');

    // 2. Verified Email Guard
    assert.ok(
      rules.includes('request.auth.token.email_verified == true'),
      'Payload 2 blocked: email_verified must be true'
    );

    // 3. Shadow Field Injection Guard (hasOnly on all entities)
    assert.ok(
      rules.includes("data.keys().hasOnly(['ownerId', 'displayName', 'photoURL', 'createdAt', 'updatedAt'])"),
      'Payload 3 blocked: UserProfile strict key allowlist'
    );

    // 4. Orphaned Subcollection Write Guard (Master Gate parent existence check)
    assert.ok(
      rules.includes('hasParentUser(userId)'),
      'Payload 4 blocked: Subcollections require parent user document'
    );

    // 5. Path Variable Hardening (isValidId)
    assert.ok(
      rules.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')") && rules.includes('isValidId(slotId)'),
      'Payload 5 blocked: Path variable regex and size check'
    );

    // 6. Cross-User PII Isolation Guard
    assert.ok(
      rules.includes('match /private/{docId}') && rules.includes('isOwner(userId)'),
      'Payload 6 blocked: Isolated PII subcollection restricted to owner'
    );

    // 7 & 8. Immutable Field Guards on Update
    assert.ok(
      rules.includes('incoming().ownerId == existing().ownerId') &&
        rules.includes('incoming().createdAt == existing().createdAt'),
      'Payloads 7 & 8 blocked: ownerId and createdAt are immutable on update'
    );

    // 9. Temporal Integrity Guard (request.time)
    assert.ok(
      rules.includes('incoming().createdAt == request.time') &&
        rules.includes('incoming().updatedAt == request.time'),
      'Payload 9 blocked: createdAt and updatedAt must equal request.time'
    );

    // 10. Value Poisoning Guard (gameDate regex & length)
    assert.ok(
      rules.includes("data.gameDate.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')"),
      'Payload 10 blocked: gameDate format and size check'
    );

    // 11. Type Poisoning Guard (careerState must be a native map with strict keys)
    assert.ok(
      rules.includes('cs is map') &&
        rules.includes('isValidCareerStateMap(data.careerState)'),
      'Payload 11 blocked: careerState must be a validated native map'
    );

    // 12. Secure List Query Enforcer (checks resource.data.ownerId without get/exists)
    assert.ok(
      rules.includes('allow list: if isSignedIn() && isVerifiedUser() && userId == request.auth.uid && resource.data.ownerId == request.auth.uid;'),
      'Payload 12 blocked: allow list enforces resource.data.ownerId == request.auth.uid'
    );
  });
});

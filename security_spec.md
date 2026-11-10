# TOUCHLINE — Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants & Master Source of Truth

1. **Master Identity Root (`/users/{userId}`)**:
   - A `UserProfile` document at `/users/{userId}` can only be created, read, or updated by the authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
   - `ownerId` MUST equal `request.auth.uid` and `userId`, and is strictly immutable after creation.
   - PII (`email`) is strictly forbidden in `/users/{userId}` and isolated into `/users/{userId}/private/{docId}`.

2. **Isolated PII Subcollection (`/users/{userId}/private/{docId}`)**:
   - Can only exist if the parent `/users/{userId}` exists (`exists(...)` or `existsAfter(...)`) and belongs to `request.auth.uid`.
   - Readable and writable strictly by the verified owner (`request.auth.uid == userId`).

3. **Career Save Slots (`/users/{userId}/saves/{slotId}`)**:
   - Can only exist if the parent `/users/{userId}` exists (`exists(...)` or `existsAfter(...)`) and belongs to `request.auth.uid`.
   - `ownerId` MUST equal `request.auth.uid` and `userId`.
   - `slotId` field MUST equal the `{slotId}` path variable and match `^[a-zA-Z0-9_\-]+$` with length `<= 64`.
   - `createdAt` and `updatedAt` MUST match `request.time` (server timestamp). `createdAt`, `ownerId`, and `slotId` are immutable on `update`.
   - `careerState` MUST be a native Firestore `map` with strictly validated keys (`processedDates`, `manager`, `standings`, `clubs`, `staff`, `completedFixtures`, `modifiedPlayers`, `playerDiffs`, `transferOffers`, `shortlistPlayerIds`, `scoutAssignments`, `scoutReports`, `transactions`, `inbox`).
   - `allow list` MUST verify `resource.data.ownerId == request.auth.uid && userId == request.auth.uid` without any `get()` or `exists()` calls.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 — Identity Spoofing (`ownerId` Mismatch on Save Creation)**
   ```json
   {
     "path": "/users/user_victim/saves/slot_1",
     "auth": { "uid": "user_attacker", "email_verified": true },
     "data": {
       "ownerId": "user_victim",
       "slotId": "slot_1",
       "saveName": "Spoofed Save",
       "clubName": "Arsenal FC",
       "managerName": "Attacker",
       "gameDate": "2026-08-01",
       "season": "2026/27",
       "lastSavedAtIso": "2026-11-10T10:00:00.000Z",
       "randomSeed": 20261110,
       "controlledClubId": "club_eng_pl_0",
       "careerState": {}
     }
   }
   ```

2. **Payload 2 — Unverified Email Write Attempt (`email_verified: false`)**
   ```json
   {
     "path": "/users/user_1/saves/slot_1",
     "auth": { "uid": "user_1", "email_verified": false },
     "data": {
       "ownerId": "user_1",
       "slotId": "slot_1",
       "saveName": "Unverified Save",
       "clubName": "Arsenal FC",
       "managerName": "Mikel Arteta",
       "gameDate": "2026-08-01",
       "season": "2026/27",
       "lastSavedAtIso": "2026-11-10T10:00:00.000Z",
       "randomSeed": 20261110,
       "controlledClubId": "club_eng_pl_0",
       "careerState": {}
     }
   }
   ```

3. **Payload 3 — Shadow Field Injection (`isAdmin: true` Ghost Key)**
   ```json
   {
     "path": "/users/user_1",
     "auth": { "uid": "user_1", "email_verified": true },
     "data": {
       "ownerId": "user_1",
       "displayName": "Mikel Arteta",
       "photoURL": "",
       "isAdmin": true
     }
   }
   ```

4. **Payload 4 — Orphaned Subcollection Write (No Parent `/users/{userId}` Document)**
   ```json
   {
     "path": "/users/user_no_profile/saves/slot_autosave",
     "auth": { "uid": "user_no_profile", "email_verified": true },
     "data": {
       "ownerId": "user_no_profile",
       "slotId": "slot_autosave",
       "saveName": "Orphan Save",
       "clubName": "Arsenal FC",
       "managerName": "Mikel Arteta",
       "gameDate": "2026-08-01",
       "season": "2026/27",
       "lastSavedAtIso": "2026-11-10T10:00:00.000Z",
       "randomSeed": 20261110,
       "controlledClubId": "club_eng_pl_0",
       "careerState": {}
     }
   }
   ```

5. **Payload 5 — Path Variable Poisoning (Invalid Characters in `{slotId}`)**
   ```json
   {
     "path": "/users/user_1/saves/slot$bad!id",
     "auth": { "uid": "user_1", "email_verified": true },
     "data": {
       "ownerId": "user_1",
       "slotId": "slot$bad!id"
     }
   }
   ```

6. **Payload 6 — Cross-User PII Read Attempt (`/users/user_victim/private/info`)**
   ```json
   {
     "operation": "get",
     "path": "/users/user_victim/private/info",
     "auth": { "uid": "user_attacker", "email_verified": true }
   }
   ```

7. **Payload 7 — Immutable Field Mutation (`ownerId` Changed on Update)**
   ```json
   {
     "operation": "update",
     "path": "/users/user_1/saves/slot_1",
     "auth": { "uid": "user_1", "email_verified": true },
     "data": {
       "ownerId": "user_2"
     }
   }
   ```

8. **Payload 8 — Immutable `createdAt` Tampering on Update**
   ```json
   {
     "operation": "update",
     "path": "/users/user_1/saves/slot_1",
     "auth": { "uid": "user_1", "email_verified": true },
     "data": {
       "createdAt": "2020-01-01T00:00:00Z"
     }
   }
   ```

9. **Payload 9 — Forged Client `updatedAt` Timestamp (`updatedAt != request.time`)**
   ```json
   {
     "operation": "update",
     "path": "/users/user_1/saves/slot_1",
     "auth": { "uid": "user_1", "email_verified": true },
     "data": {
       "updatedAt": "2099-01-01T00:00:00Z"
     }
   }
   ```

10. **Payload 10 — Value Poisoning (`gameDate` Oversized String / Bad Format)**
    ```json
    {
      "operation": "update",
      "path": "/users/user_1/saves/slot_1",
      "auth": { "uid": "user_1", "email_verified": true },
      "data": {
        "gameDate": "NOT_A_VALID_DATE_STRING_TOO_LONG"
      }
    }
    ```

11. **Payload 11 — Type Poisoning (`careerState` Sent as a String Instead of a Native Map)**
    ```json
    {
      "operation": "create",
      "path": "/users/user_1/saves/slot_1",
      "auth": { "uid": "user_1", "email_verified": true },
      "data": {
        "ownerId": "user_1",
        "slotId": "slot_1",
        "saveName": "Stringified Save",
        "clubName": "Arsenal FC",
        "managerName": "Mikel Arteta",
        "gameDate": "2026-08-01",
        "season": "2026/27",
        "lastSavedAtIso": "2026-11-10T10:00:00.000Z",
        "randomSeed": 20261110,
        "controlledClubId": "club_eng_pl_0",
        "careerState": "{\"json\":\"not_allowed\"}"
      }
    }
    ```

12. **Payload 12 — Unauthorized List Scraping Across Users (`/users/user_victim/saves`)**
    ```json
    {
      "operation": "list",
      "path": "/users/user_victim/saves",
      "auth": { "uid": "user_attacker", "email_verified": true }
    }
    ```

---

## 3. Test Runner Verification

See `/firestore.rules.test.ts` for the automated test suite verifying that all 12 Dirty Dozen payloads are rejected (`PERMISSION_DENIED`) by the security rules evaluator.

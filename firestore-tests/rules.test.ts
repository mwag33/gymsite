import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-gymsite-rules-test';
const RULES_PATH = resolve(__dirname, '../firestore.rules');

const UID_A = 'user-a';
const UID_B = 'user-b';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function aliceDb() {
  return testEnv.authenticatedContext(UID_A).firestore();
}
function bobDb() {
  return testEnv.authenticatedContext(UID_B).firestore();
}
function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('/users/{uid} profile document', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', UID_A), {
        displayName: 'Alice',
        email: 'alice@example.com',
        authProvider: 'password',
        createdAt: Timestamp.now(),
        goal: 'strength',
        goalUpdatedAt: Timestamp.now(),
        homeGymIds: [],
        settings: {},
        emailVerified: true,
      });
    });
  });

  it('allows the owner to read their own profile', async () => {
    await assertSucceeds(getDoc(doc(aliceDb(), 'users', UID_A)));
  });

  it('denies another user reading the profile', async () => {
    await assertFails(getDoc(doc(bobDb(), 'users', UID_A)));
  });

  it('denies an unauthenticated client reading the profile', async () => {
    await assertFails(getDoc(doc(anonDb(), 'users', UID_A)));
  });

  it('denies the owner writing their own profile directly (server-managed)', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A), { displayName: 'Alice Hacked' }, { merge: true }),
    );
  });

  it('denies another user writing to a foreign profile', async () => {
    await assertFails(
      setDoc(doc(bobDb(), 'users', UID_A), { displayName: 'Pwned' }, { merge: true }),
    );
  });

  it('denies creating a brand new profile doc as a client', async () => {
    await assertFails(
      setDoc(doc(bobDb(), 'users', UID_B), {
        displayName: 'Bob',
        email: 'bob@example.com',
        authProvider: 'password',
        createdAt: Timestamp.now(),
        goal: 'strength',
        goalUpdatedAt: Timestamp.now(),
        homeGymIds: [],
        settings: {},
        emailVerified: false,
      }),
    );
  });
});

describe('/users/{uid}/meta/aiQuota', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'meta', 'aiQuota'), {
        count: 3,
        windowStart: Timestamp.now(),
      });
    });
  });

  it('denies the owner reading their own aiQuota doc', async () => {
    await assertFails(getDoc(doc(aliceDb(), 'users', UID_A, 'meta', 'aiQuota')));
  });

  it('denies the owner writing their own aiQuota doc', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'meta', 'aiQuota'), { count: 0 }, { merge: true }),
    );
  });

  it('denies another user reading a foreign aiQuota doc', async () => {
    await assertFails(getDoc(doc(bobDb(), 'users', UID_A, 'meta', 'aiQuota')));
  });
});

describe('/users/{uid}/workoutLogs/{logId}', () => {
  const validLog = {
    mode: 'simple',
    gymId: 'gym-1',
    date: Timestamp.now(),
    bodyParts: ['chest'],
    exercises: [],
    createdAt: Timestamp.now(),
  };

  it('allows the owner to create a valid workout log', async () => {
    await assertSucceeds(setDoc(doc(aliceDb(), 'users', UID_A, 'workoutLogs', 'log-1'), validLog));
  });

  it('allows the owner to read their own workout log', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'workoutLogs', 'log-1'), validLog);
    });
    await assertSucceeds(getDoc(doc(aliceDb(), 'users', UID_A, 'workoutLogs', 'log-1')));
  });

  it('denies another user creating a workout log for someone else', async () => {
    await assertFails(setDoc(doc(bobDb(), 'users', UID_A, 'workoutLogs', 'log-1'), validLog));
  });

  it('denies another user reading a foreign workout log', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'workoutLogs', 'log-1'), validLog);
    });
    await assertFails(getDoc(doc(bobDb(), 'users', UID_A, 'workoutLogs', 'log-1')));
  });

  it('rejects creating a log with an invalid mode', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'workoutLogs', 'log-bad-mode'), {
        ...validLog,
        mode: 'ultra',
      }),
    );
  });

  it('rejects creating a log with a non-timestamp date', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'workoutLogs', 'log-bad-date'), {
        ...validLog,
        date: '2026-08-15',
      }),
    );
  });

  it('rejects creating a log with extra unexpected fields', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'workoutLogs', 'log-extra'), {
        ...validLog,
        notes: 'this field is not in the schema',
      }),
    );
  });

  it('denies updating a log after creation, even by the owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'workoutLogs', 'log-1'), validLog);
    });
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', UID_A, 'workoutLogs', 'log-1'), { mode: 'detailed' }),
    );
  });

  it('denies deleting a log after creation, even by the owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'workoutLogs', 'log-1'), validLog);
    });
    await assertFails(deleteDoc(doc(aliceDb(), 'users', UID_A, 'workoutLogs', 'log-1')));
  });
});

describe('/users/{uid}/trackedSessions/{sessionId}', () => {
  const validSession = {
    date: '2026-08-22',
    focus: 'chest',
    note: '',
    gymId: 'gym-1',
    exercises: [
      {
        id: 'ex-1',
        name: 'Bench Press',
        machineId: 'm-1',
        gymId: 'gym-1',
        machineCategory: 'chest',
        targetSets: 3,
        targetReps: '8-12',
        sets: [],
        status: 'pending',
      },
    ],
    status: 'in_progress',
    sourcePlanSessionId: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastSyncedLogAt: null,
  };

  it('allows the owner to create a valid tracked session', async () => {
    await assertSucceeds(setDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-1'), validSession));
  });

  it('allows the owner to read their own tracked session', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertSucceeds(getDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-1')));
  });

  it('denies another user creating a tracked session for someone else', async () => {
    await assertFails(setDoc(doc(bobDb(), 'users', UID_A, 'trackedSessions', 's-1'), validSession));
  });

  it('denies another user reading a foreign tracked session', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertFails(getDoc(doc(bobDb(), 'users', UID_A, 'trackedSessions', 's-1')));
  });

  it('rejects creating a session with a malformed date', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-bad-date'), {
        ...validSession,
        date: '08-22-2026',
      }),
    );
  });

  it('rejects creating a session with an invalid focus', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-bad-focus'), {
        ...validSession,
        focus: 'arms',
      }),
    );
  });

  it('rejects creating a session with more than 20 exercises', async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ ...validSession.exercises[0], id: `ex-${i}` }));
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-too-many'), {
        ...validSession,
        exercises: tooMany,
      }),
    );
  });

  it('rejects creating a session with extra unexpected fields', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-extra'), {
        ...validSession,
        notes: 'this field is not in the schema',
      }),
    );
  });

  it('allows the owner to update exercises (autosave)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertSucceeds(
      updateDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-1'), {
        exercises: [
          { ...validSession.exercises[0], sets: [{ reps: 10, weightKg: 60 }], status: 'logged' },
        ],
        status: 'done',
        updatedAt: Timestamp.now(),
        lastSyncedLogAt: Timestamp.now(),
      }),
    );
  });

  it('denies changing the date after creation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-1'), { date: '2026-08-23' }),
    );
  });

  it('denies changing sourcePlanSessionId after creation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-1'), { sourcePlanSessionId: 'plan-session-1' }),
    );
  });

  it('denies another user updating a foreign tracked session', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertFails(
      updateDoc(doc(bobDb(), 'users', UID_A, 'trackedSessions', 's-1'), { status: 'done' }),
    );
  });

  it('allows the owner to delete their own tracked session', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertSucceeds(deleteDoc(doc(aliceDb(), 'users', UID_A, 'trackedSessions', 's-1')));
  });

  it('denies another user deleting a foreign tracked session', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A, 'trackedSessions', 's-1'), validSession);
    });
    await assertFails(deleteDoc(doc(bobDb(), 'users', UID_A, 'trackedSessions', 's-1')));
  });
});

describe('/users/{uid}/machineStats', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', UID_A, 'machineStats', 'machine-1'), {
        totalSets: 10,
      });
      await setDoc(doc(db, 'users', UID_A, 'machineStats', 'machine-1', 'history', 'entry-1'), {
        reps: 8,
      });
    });
  });

  it('allows the owner to read their own machine stats', async () => {
    await assertSucceeds(getDoc(doc(aliceDb(), 'users', UID_A, 'machineStats', 'machine-1')));
  });

  it('allows the owner to read their own machine stats history entries', async () => {
    await assertSucceeds(
      getDoc(doc(aliceDb(), 'users', UID_A, 'machineStats', 'machine-1', 'history', 'entry-1')),
    );
  });

  it('denies another user reading foreign machine stats', async () => {
    await assertFails(getDoc(doc(bobDb(), 'users', UID_A, 'machineStats', 'machine-1')));
  });

  it('denies the owner writing their own machine stats', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'machineStats', 'machine-1'), { totalSets: 999 }, { merge: true }),
    );
  });

  it('denies another user writing to a foreign machine stats doc', async () => {
    await assertFails(
      setDoc(doc(bobDb(), 'users', UID_A, 'machineStats', 'machine-1'), { totalSets: 1 }, { merge: true }),
    );
  });

  it('denies the owner writing to their own machine stats history', async () => {
    await assertFails(
      setDoc(
        doc(aliceDb(), 'users', UID_A, 'machineStats', 'machine-1', 'history', 'entry-2'),
        { reps: 1 },
      ),
    );
  });
});

describe('/users/{uid}/trainingPlans', () => {
  // "history" is modeled as a subcollection of the `current` document
  // (see firestore.rules comment) since Firestore document paths need an
  // even number of segments: /trainingPlans/history/{planId} (5 segments)
  // is not a valid document path, but /trainingPlans/current/history/
  // {planId} (6 segments) is.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', UID_A, 'trainingPlans', 'current'), { weekNumber: 1 });
      await setDoc(doc(db, 'users', UID_A, 'trainingPlans', 'current', 'history', 'plan-1'), { weekNumber: 0 });
    });
  });

  it('allows the owner to read their current training plan', async () => {
    await assertSucceeds(getDoc(doc(aliceDb(), 'users', UID_A, 'trainingPlans', 'current')));
  });

  it('allows the owner to read a historical training plan', async () => {
    await assertSucceeds(
      getDoc(doc(aliceDb(), 'users', UID_A, 'trainingPlans', 'current', 'history', 'plan-1')),
    );
  });

  it('denies another user reading a foreign training plan', async () => {
    await assertFails(getDoc(doc(bobDb(), 'users', UID_A, 'trainingPlans', 'current')));
  });

  it('denies the owner writing their own current training plan', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', UID_A, 'trainingPlans', 'current'), { weekNumber: 2 }, { merge: true }),
    );
  });

  it('denies another user writing to a foreign current training plan', async () => {
    await assertFails(
      setDoc(doc(bobDb(), 'users', UID_A, 'trainingPlans', 'current'), { weekNumber: 2 }, { merge: true }),
    );
  });
});

describe('/gyms/{gymId}', () => {
  const validGym = {
    name: 'Downtown Fitness',
    createdBy: UID_A,
    createdAt: Timestamp.now(),
    memberCount: 0,
    location: { city: 'Berlin', country: 'Germany' },
  };

  it('allows any authenticated user to read a gym', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1'), validGym);
    });
    await assertSucceeds(getDoc(doc(bobDb(), 'gyms', 'gym-1')));
  });

  it('denies an unauthenticated client reading a gym', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1'), validGym);
    });
    await assertFails(getDoc(doc(anonDb(), 'gyms', 'gym-1')));
  });

  it('allows an authenticated user to create a valid gym with themselves as createdBy', async () => {
    await assertSucceeds(setDoc(doc(aliceDb(), 'gyms', 'gym-1'), validGym));
  });

  it('allows location to be null on create', async () => {
    await assertSucceeds(
      setDoc(doc(aliceDb(), 'gyms', 'gym-null-loc'), { ...validGym, location: null }),
    );
  });

  it('denies creating a gym with createdBy set to someone else', async () => {
    await assertFails(setDoc(doc(aliceDb(), 'gyms', 'gym-2'), { ...validGym, createdBy: UID_B }));
  });

  it('denies creating a gym with a name longer than 80 characters', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'gyms', 'gym-3'), { ...validGym, name: 'x'.repeat(81) }),
    );
  });

  it('denies creating a gym with a non-zero memberCount', async () => {
    await assertFails(setDoc(doc(aliceDb(), 'gyms', 'gym-4'), { ...validGym, memberCount: 5 }));
  });

  it('denies creating a gym with extra unexpected fields', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'gyms', 'gym-5'), { ...validGym, extra: 'field' }),
    );
  });

  it('allows any authenticated user to bump memberCount', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1'), validGym);
    });
    await assertSucceeds(
      updateDoc(doc(bobDb(), 'gyms', 'gym-1'), { memberCount: 1 }),
    );
  });

  it('denies updating fields other than memberCount', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1'), validGym);
    });
    await assertFails(updateDoc(doc(bobDb(), 'gyms', 'gym-1'), { name: 'Renamed Gym' }));
  });

  it('denies deleting a gym', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1'), validGym);
    });
    await assertFails(deleteDoc(doc(aliceDb(), 'gyms', 'gym-1')));
  });
});

describe('/gyms/{gymId}/machines/{machineId}', () => {
  const validGym = {
    name: 'Downtown Fitness',
    createdBy: UID_A,
    createdAt: Timestamp.now(),
    memberCount: 0,
    location: null,
  };
  const validMachine = {
    name: 'Leg Press',
    category: 'legs',
    addedBy: UID_A,
    createdAt: Timestamp.now(),
    archived: false,
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1'), validGym);
    });
  });

  it('allows any authenticated user to read the machines subcollection', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1', 'machines', 'm-1'), validMachine);
    });
    await assertSucceeds(getDocs(collection(bobDb(), 'gyms', 'gym-1', 'machines')));
  });

  it('denies an unauthenticated client reading machines', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1', 'machines', 'm-1'), validMachine);
    });
    await assertFails(getDocs(collection(anonDb(), 'gyms', 'gym-1', 'machines')));
  });

  it('allows creating a valid machine with addedBy set to self', async () => {
    await assertSucceeds(
      setDoc(doc(aliceDb(), 'gyms', 'gym-1', 'machines', 'm-1'), validMachine),
    );
  });

  it('denies creating a machine with addedBy set to someone else', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'gyms', 'gym-1', 'machines', 'm-2'), { ...validMachine, addedBy: UID_B }),
    );
  });

  it('denies creating a machine with an invalid category', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'gyms', 'gym-1', 'machines', 'm-3'), { ...validMachine, category: 'arms' }),
    );
  });

  it('denies creating a machine with extra unexpected fields', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'gyms', 'gym-1', 'machines', 'm-4'), { ...validMachine, brand: 'Technogym' }),
    );
  });

  it('denies creating a machine that is archived == true', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'gyms', 'gym-1', 'machines', 'm-5'), { ...validMachine, archived: true }),
    );
  });

  it('allows updating only name and archived on a machine', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1', 'machines', 'm-1'), validMachine);
    });
    await assertSucceeds(
      updateDoc(doc(bobDb(), 'gyms', 'gym-1', 'machines', 'm-1'), { name: 'Leg Press v2', archived: true }),
    );
  });

  it('denies changing category after creation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1', 'machines', 'm-1'), validMachine);
    });
    await assertFails(
      updateDoc(doc(bobDb(), 'gyms', 'gym-1', 'machines', 'm-1'), { category: 'cardio' }),
    );
  });

  it('denies changing addedBy after creation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1', 'machines', 'm-1'), validMachine);
    });
    await assertFails(
      updateDoc(doc(bobDb(), 'gyms', 'gym-1', 'machines', 'm-1'), { addedBy: UID_B }),
    );
  });

  it('denies deleting a machine (soft-delete only)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gyms', 'gym-1', 'machines', 'm-1'), validMachine);
    });
    await assertFails(deleteDoc(doc(aliceDb(), 'gyms', 'gym-1', 'machines', 'm-1')));
  });
});

describe('/system/featureFlags', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'system', 'featureFlags'), { aiEnabled: true });
    });
  });

  it('denies any authenticated client reading feature flags', async () => {
    await assertFails(getDoc(doc(aliceDb(), 'system', 'featureFlags')));
  });

  it('denies any authenticated client writing feature flags', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'system', 'featureFlags'), { aiEnabled: false }, { merge: true }),
    );
  });

  it('denies an unauthenticated client reading feature flags', async () => {
    await assertFails(getDoc(doc(anonDb(), 'system', 'featureFlags')));
  });
});

describe('unauthenticated access', () => {
  it('cannot read another user profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID_A), { displayName: 'Alice' });
    });
    await assertFails(getDoc(doc(anonDb(), 'users', UID_A)));
  });

  it('cannot create a workout log', async () => {
    await assertFails(
      setDoc(doc(anonDb(), 'users', UID_A, 'workoutLogs', 'log-1'), {
        mode: 'simple',
        gymId: 'gym-1',
        date: Timestamp.now(),
        bodyParts: [],
        exercises: [],
        createdAt: Timestamp.now(),
      }),
    );
  });

  it('cannot create a gym', async () => {
    await assertFails(
      setDoc(doc(anonDb(), 'gyms', 'gym-anon'), {
        name: 'Anon Gym',
        createdBy: 'ghost',
        createdAt: Timestamp.now(),
        memberCount: 0,
        location: null,
      }),
    );
  });
});

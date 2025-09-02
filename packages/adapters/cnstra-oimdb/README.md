@cnstra/react
React bindings for CNS neural network-inspired event flow system.

Installation
npm install @cnstra/react @cnstra/core
Usage
Basic Setup
import React from 'react';
import { CNSProvider, useCNS } from '@cnstra/react';
import { CNS, neuron, collateral } from '@cnstra/core';

// Create your CNS instance
const cns = new CNS([
  neuron('counter', {
    increment: collateral('increment'),
    decrement: collateral('decrement')
  }).dendrite({
    collateral: collateral('increment'),
    response: (payload, axon) => {
      // Handle increment logic here
      return axon.increment.createSignal();
    }
  }).dendrite({
    collateral: collateral('decrement'),
    response: (payload, axon) => {
      // Handle decrement logic here
      return axon.decrement.createSignal();
    }
  })
]);

function App() {
  return (
    <CNSProvider cns={cns}>
      <Counter />
    </CNSProvider>
  );
}
Using the Hook
import { useCNS } from '@cnstra/react';
import { collateral } from '@cnstra/core';

function Counter() {
  const cns = useCNS();
  
  const handleIncrement = () => {
    cns.stimulate(collateral('increment').createSignal());
  };
  
  const handleDecrement = () => {
    cns.stimulate(collateral('decrement').createSignal());
  };
  
  return (
    <div>
      <button onClick={handleIncrement}>+</button>
      <button onClick={handleDecrement}>-</button>
    </div>
  );
}
Multiple CNS Instances
You can create multiple CNS instances and use them in different parts of your app:

import React from 'react';
import { CNSProvider, useCNS } from '@cnstra/react';

// First CNS instance
const cns1 = new CNS([/* neurons */]);
const cns2 = new CNS([/* other neurons */]);

function App() {
  return (
    <div>
      <CNSProvider cns={cns1}>
        <Component1 />
      </CNSProvider>
      
      <CNSProvider cns={cns2}>
        <Component2 />
      </CNSProvider>
    </div>
  );
}

function Component1() {
  const cns = useCNS(); // Uses cns1
  // ...
}

function Component2() {
  const cns = useCNS(); // Uses cns2
  // ...
}
API
CNSProvider
A React context provider that makes a CNS instance available to child components.

Props:

cns: The CNS instance to provide
children: React components that will have access to the CNS context
useCNS()
A React hook that returns the CNS instance from the nearest CNSProvider.

Returns: The CNS instance

Throws: An error if used outside of a CNSProvider

TypeScript Support
The package is fully typed and supports generic types for your CNS instances:

import { CNSProvider, useCNS } from '@cnstra/react';

// With custom types
const cns = new CNS<MyCollateralId, MyNeuronId, MyNeuron, MyDendrite>([/* neurons */]);

function MyComponent() {
  const cns = useCNS<MyCollateralId, MyNeuronId, MyNeuron, MyDendrite>();
  // cns is fully typed
}

@oimdb/react
React integration for OIMDB - Hooks for selection and subscription with reactive collections and indexes.

Overview
@oimdb/react provides React hooks that work with OIMDB reactive objects (OIMReactiveCollection and OIMReactiveIndex). The library includes both direct hooks for component-level usage and React Context utilities for application-wide data management.

Features
Reactive Integration: Hooks work with OIMReactiveCollection and OIMReactiveIndex from @oimdb/core
Automatic Subscription: Uses useSyncExternalStore for optimal React 18+ performance
Event Coalescing: Leverages OIMDB's built-in event coalescing for efficient updates
Type Safety: Full TypeScript support with advanced generic type inference
Context Support: Optional React Context for centralized collection management
Flexible Usage: Use hooks directly or through context provider pattern
Installation
npm install @oimdb/react @oimdb/core
Usage
Basic Setup
import { OIMEventQueue, OIMRICollection, OIMReactiveIndexManual } from '@oimdb/core';
import { 
  useSelectEntitiesByPks, 
  selectEntitiesByIndexKey,
  selectEntityByPk 
} from '@oimdb/react';

// Create event queue and reactive collections
const queue = new OIMEventQueue();
const userTeamIndex = new OIMReactiveIndexManual<string, string>(queue);
const usersCollection = new OIMRICollection(queue, {
  collectionOpts: { selectPk: (user: User) => user.id },
  indexes: { byTeam: userTeamIndex },
});
Single Entity Selection
function UserProfile({ userId }: { userId: string }) {
  const user = selectEntityByPk(usersCollection, userId);

  if (!user) return <div>Loading...</div>;

  return (
    <div>
      <h2>{user.name}</h2>
      <p>Email: {user.email}</p>
    </div>
  );
}
Multiple Entities Selection
function UserList({ userIds }: { userIds: string[] }) {
  const users = useSelectEntitiesByPks(usersCollection, userIds);

  return (
    <ul>
      {users.map((user, index) => (
        <li key={user?.id || index}>
          {user ? user.name : 'Loading...'}
        </li>
      ))}
    </ul>
  );
}
Index-based Selection
function TeamMembers({ teamId }: { teamId: string }) {
  const teamUsers = selectEntitiesByIndexKey(
    usersCollection,
    usersCollection.indexes.byTeam,
    teamId
  );

  return (
    <div>
      {teamUsers.map((user, index) => (
        <div key={user?.id || index}>
          {user ? `${user.name} (${user.role})` : 'Loading...'}
        </div>
      ))}
    </div>
  );
}
React Context Integration
For applications with multiple collections, use the React Context pattern for centralized management:

Context Setup
import { 
  OIMRICollectionsProvider, 
  useOIMCollectionsContext,
  StrictCollectionsDictionary 
} from '@oimdb/react';

interface User {
  id: string;
  name: string;
  teamId: string;
}

interface Team {
  id: string;
  name: string;
}

function createCollections() {
  const queue = new OIMEventQueue();
  
  const userTeamIndex = new OIMReactiveIndexManual<string, string>(queue);
  const usersCollection = new OIMRICollection(queue, {
    collectionOpts: { selectPk: (user: User) => user.id },
    indexes: { byTeam: userTeamIndex },
  });
  
  const teamsCollection = new OIMRICollection(queue, {
    collectionOpts: { selectPk: (team: Team) => team.id },
    indexes: {},
  });
  
  return { users: usersCollection, teams: teamsCollection } as const;
}

type AppCollections = StrictCollectionsDictionary<ReturnType<typeof createCollections>>;
Provider Setup
function App() {
  const collections = React.useMemo(() => createCollections(), []);
  
  return (
    <OIMRICollectionsProvider collections={collections}>
      <UserDashboard />
    </OIMRICollectionsProvider>
  );
}
Using Context in Components
function UserDashboard() {
  const { users, teams } = useOIMCollectionsContext<AppCollections>();
  
  // Use collections with hooks
  const allUsers = useSelectEntitiesByPks(users, []);
  const teamMembers = selectEntitiesByIndexKey(
    users,
    users.indexes.byTeam,
    'team1'
  );
  
  return (
    <div>
      <h2>All Users: {allUsers.length}</h2>
      <h3>Team 1 Members: {teamMembers.length}</h3>
    </div>
  );
}
Custom Context
For multiple independent contexts:

const UserContext = createOIMCollectionsContext<{ users: typeof usersCollection }>();

function UserProvider({ children }: { children: React.ReactNode }) {
  const collections = React.useMemo(() => ({ users: usersCollection }), []);
  
  return (
    <OIMRICollectionsProvider collections={collections} context={UserContext}>
      {children}
    </OIMRICollectionsProvider>
  );
}

function UserComponent() {
  const { users } = useOIMCollectionsContext(UserContext);
  // Use users collection...
}
API Reference
selectEntityByPk(reactiveCollection, pk)
Subscribes to a single entity from a reactive collection.

Parameters:

reactiveCollection: OIMReactiveCollection<TEntity, TPk> - Reactive collection instance
pk: TPk - Primary key of the entity
Returns:

TEntity | undefined - Entity data or undefined if not found
useSelectEntitiesByPks(reactiveCollection, pks)
Subscribes to multiple entities from a reactive collection.

Parameters:

reactiveCollection: OIMReactiveCollection<TEntity, TPk> - Reactive collection instance
pks: readonly TPk[] - Array of primary keys
Returns:

(TEntity | undefined)[] - Array of entities (undefined for missing entities)
selectEntitiesByIndexKey(reactiveCollection, reactiveIndex, key)
Subscribes to entities indexed by a specific key.

Parameters:

reactiveCollection: OIMReactiveCollection<TEntity, TPk> - Reactive collection instance
reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex> - Reactive index instance
key: TKey - Index key to query
Returns:

(TEntity | undefined)[] - Array of entities for the given index key
selectEntitiesByIndexKeys(reactiveCollection, reactiveIndex, keys)
Subscribes to entities indexed by multiple keys.

Parameters:

reactiveCollection: OIMReactiveCollection<TEntity, TPk> - Reactive collection instance
reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex> - Reactive index instance
keys: readonly TKey[] - Array of index keys to query
Returns:

(TEntity | undefined)[] - Array of entities for the given index keys
useSelectPksByIndexKey(reactiveIndex, key)
Subscribes to primary keys indexed by a specific key.

Parameters:

reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex> - Reactive index instance
key: TKey - Index key to query
Returns:

TPk[] - Array of primary keys for the given index key
useSelectPksByIndexKeys(reactiveIndex, keys)
Subscribes to primary keys indexed by multiple keys.

Parameters:

reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex> - Reactive index instance
keys: readonly TKey[] - Array of index keys to query
Returns:

Map<TKey, TPk[]> - Map of index keys to their corresponding primary keys
Context API Reference
OIMRICollectionsProvider<T>
Provider component for collections context.

Props:

collections: T - Dictionary of reactive collections
children: ReactNode - React children
context?: React.Context<OIMContextValue<T>> - Optional custom context
useOIMCollectionsContext<T>(context?)
Hook to access collections from context.

Parameters:

context?: React.Context<OIMContextValue<T>> - Optional custom context
Returns:

T - Collections dictionary with full type safety
Throws:

Error if used outside of provider
createOIMCollectionsContext<T>()
Creates a custom collections context with specific typing.

Returns:

React.Context<OIMContextValue<T>> - Typed React context
Type Utilities
StrictCollectionsDictionary<T>
Ensures collections dictionary maintains exact types.

CollectionsDictionary
Base type for any collections dictionary.

ExtractEntityType<T>, ExtractPkType<T>, etc.
Type utilities for extracting specific types from collections.

Architecture
Reactive Collections Integration
The hooks work directly with OIMDB reactive objects:

// Use reactive collections and indexes directly
const user = selectEntityByPk(reactiveCollection, 'user123');
const posts = selectEntitiesByIndexKey(reactiveCollection, reactiveIndex, 'tech');
Event Subscription
Hooks automatically subscribe to OIMDB reactive events using useSyncExternalStore:

Collection updates: Subscribe to reactiveCollection.updateEventEmitter
Index updates: Subscribe to reactiveIndex.updateEventEmitter
Optimized subscriptions: Subscribe only to specific keys for efficient updates
Automatic cleanup: Unsubscribe when component unmounts
Performance
React 18+ Integration: Uses useSyncExternalStore for optimal performance
Event Coalescing: OIMDB's built-in event coalescing reduces unnecessary re-renders
Key-specific subscriptions: Only listen to changes for relevant data
Memory Management: Automatic cleanup prevents memory leaks
Efficient batching: Updates are batched through React's concurrent features
Examples
Complete Example
import React from 'react';
import { OIMEventQueue, OIMRICollection, OIMReactiveIndexManual } from '@oimdb/core';
import { selectEntityByPk, useSelectEntitiesByPks, selectEntitiesByIndexKey } from '@oimdb/react';

interface User {
  id: string;
  name: string;
  email: string;
  teamId: string;
}

// Setup
function createUserCollection() {
  const queue = new OIMEventQueue();
  const teamIndex = new OIMReactiveIndexManual<string, string>(queue);
  
  return new OIMRICollection(queue, {
    collectionOpts: { selectPk: (user: User) => user.id },
    indexes: { byTeam: teamIndex },
  });
}

const usersCollection = createUserCollection();

// Component
function UserProfile({ userId }: { userId: string }) {
  const user = selectEntityByPk(usersCollection, userId);
  
  if (!user) return <div>Loading...</div>;
  
  return <h2>{user.name}</h2>;
}

function TeamDashboard({ teamId }: { teamId: string }) {
  const teamMembers = selectEntitiesByIndexKey(
    usersCollection,
    usersCollection.indexes.byTeam,
    teamId
  );
  
  return (
    <div>
      <h3>Team Members ({teamMembers.length})</h3>
      {teamMembers.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
With Context Provider
import { 
  OIMRICollectionsProvider, 
  useOIMCollectionsContext 
} from '@oimdb/react';

function App() {
  const collections = React.useMemo(() => ({
    users: createUserCollection(),
    // ... other collections
  }), []);
  
  return (
    <OIMRICollectionsProvider collections={collections}>
      <Dashboard />
    </OIMRICollectionsProvider>
  );
}

function Dashboard() {
  const { users } = useOIMCollectionsContext();
  const allUsers = useSelectEntitiesByPks(users, []);
  
  return <div>Total Users: {allUsers.length}</div>;
}
Migration from v0.x
The v1.x API has changed significantly to work with reactive collections:

Hook Name Changes
// v0.x - Abstract storage interfaces
const user = useEntity(userStorage, 'user123');
const users = useEntities(userStorage, userIds);
const posts = useIndex(postStorage, categoryIndex, 'tech');

// v1.x - Reactive collections
const user = selectEntityByPk(reactiveCollection, 'user123');
const users = useSelectEntitiesByPks(reactiveCollection, userIds);
const posts = selectEntitiesByIndexKey(reactiveCollection, reactiveIndex, 'tech');
Collection Creation
// v0.x - With DX layer
const db = createDb({ scheduler: 'microtask' });
const users = db.createCollection<User>();
const user = useEntity(users.advanced.collection, userId);

// v1.x - Direct reactive collections
const queue = new OIMEventQueue();
const usersCollection = new OIMRICollection(queue, {
  collectionOpts: { selectPk: (user: User) => user.id },
  indexes: {},
});
const user = selectEntityByPk(usersCollection, userId);
Context API
// v0.x - No context support

// v1.x - Full context support
const collections = { users: usersCollection };
<OIMRICollectionsProvider collections={collections}>
  <App />
</OIMRICollectionsProvider>
Key Changes
Hook naming: More explicit names like selectEntityByPk vs useEntity
Parameters: Direct reactive collection objects instead of storage abstractions
Context: New context API for centralized collection management
Type safety: Enhanced TypeScript support with better inference
Dependencies
@oimdb/core - Core OIMDB functionality
react - React hooks and components
License
MIT

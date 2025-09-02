import { placeholderAdapter } from './index';
import { generateDataset } from '@bench/core';

// Simple test to verify the adapter works
function testAdapter() {
  console.log('Testing placeholder adapter...');
  
  // Generate test data
  const dataset = generateDataset({ decks: 10, cardsPerDeck: 3, seed: 42 });
  console.log('Generated dataset with', dataset.decksOrder.length, 'decks');
  
  // Create store
  const store = placeholderAdapter.createStore(dataset);
  console.log('Created store');
  
  // Test hooks work (simulate what happens in React components)
  const state = store.getState();
  
  // Test deck IDs
  const deckIds = state.decksOrder;
  console.log('Deck IDs:', deckIds.slice(0, 3));
  
  // Test deck by ID
  const firstDeckId = deckIds[0];
  const firstDeck = state.entities.decks[firstDeckId];
  console.log('First deck:', firstDeck.title, 'with', firstDeck.cardIds.length, 'cards');
  
  // Test cards by deck ID
  const cards = firstDeck.cardIds.slice(0, 3).map(id => state.entities.cards[id]).filter(Boolean);
  console.log('First 3 cards:', cards.map(c => c.title));
  
  // Test comments by card ID  
  const firstCard = cards[0];
  if (firstCard) {
    const comments = firstCard.commentIds.slice(0, 2).map(id => state.entities.comments[id]).filter(Boolean);
    console.log('First 2 comments:', comments.map(c => c.text));
  }
  
  // Test actions
  const actions = placeholderAdapter.bindActions(store);
  
  // Test search
  actions.setSearchQuery('Deck 0');
  const stateAfterSearch = store.getState();
  console.log('Search query set to "Deck 0", state updated:', stateAfterSearch.searchQuery);
  
  console.log('✅ All tests passed!');
}

if (typeof window === 'undefined') {
  // Running in Node.js
  testAdapter();
}

export { testAdapter };
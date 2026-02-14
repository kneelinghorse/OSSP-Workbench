/**
 * Registration Pipeline Module - Barrel Exports
 *
 * @module core/registration
 */

import RegistrationPipeline from './registration-pipeline.js';
import {
  STATES,
  EVENTS,
  TRANSITIONS,
  isValidState,
  isValidEvent,
  canTransition,
  getInitialState,
  isTerminalState
} from './state-machine-definition.js';
import {
  OptimisticLockException,
  DEFAULT_RETRY_CONFIG
} from './optimistic-lock.js';
import {
  EVENT_TYPES,
  createEvent,
  createStateTransitionEvent
} from './event-sourcing.js';
import {
  DEFAULT_BASE_DIR,
  getManifestDir,
  deleteManifestState
} from './file-persistence.js';

export {
  // Main class
  RegistrationPipeline,

  // State machine
  STATES,
  EVENTS,
  TRANSITIONS,
  isValidState,
  isValidEvent,
  canTransition,
  getInitialState,
  isTerminalState,

  // Optimistic locking
  OptimisticLockException,
  DEFAULT_RETRY_CONFIG,

  // Event sourcing
  EVENT_TYPES,
  createEvent,
  createStateTransitionEvent,

  // File persistence
  DEFAULT_BASE_DIR,
  getManifestDir,
  deleteManifestState
};

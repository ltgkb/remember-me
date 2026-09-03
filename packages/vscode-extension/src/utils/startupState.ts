/** Build the status-bar state shown immediately after extension activation. */

import type { Profile, ProjectContext } from '../types';
import type { StatusBarState } from '../ui/statusBar';
import type { SearchMode } from './searchSettings';
import { isValidProfile } from './profileGuard';

export function createStartupStatusState(
  profile: Profile | null,
  currentProject: ProjectContext | null,
  searchMode: SearchMode
): StatusBarState {
  const validProfile = isValidProfile(profile) ? profile : null;
  return {
    profile: validProfile,
    currentProject,
    isMemoryActive: validProfile !== null,
    searchMode,
    semanticLoading: false,
  };
}

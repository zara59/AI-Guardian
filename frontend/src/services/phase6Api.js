// Phase 6 lives in the "full end to end execution and testing" folder.
// This path is kept as a re-export seam so the main frontend can import it.
import phase6Api from '../../../full end to end execution and testing/frontend/api.js';
import Phase6Readiness from '../../../full end to end execution and testing/frontend/Phase6Readiness.jsx';
import Phase6Funding from '../../../full end to end execution and testing/frontend/Phase6Funding.jsx';
import Phase6StateBadge, {
  stateTone,
  Phase6Idle,
} from '../../../full end to end execution and testing/frontend/Phase6StateBadge.jsx';

export { phase6Api };
export { Phase6Readiness, Phase6Funding, Phase6StateBadge, stateTone, Phase6Idle };
export default phase6Api;
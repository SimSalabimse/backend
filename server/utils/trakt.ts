import Trakt from 'trakt.tv';

let trakt: Trakt | null = null;
let traktInitialized = false;

function initTrakt() {
  if (traktInitialized) return trakt;
  
  const traktKeys = useRuntimeConfig().trakt;
  
  if (traktKeys?.clientId && traktKeys?.clientSecret) {
    const options = {
      client_id: traktKeys.clientId,
      client_secret: traktKeys.clientSecret,
    };
    trakt = new Trakt(options);
  }
  
  traktInitialized = true;
  return trakt;
}

// Export a getter function instead of the instance
export function getTrakt(): Trakt | null {
  return initTrakt();
}

// For backward compatibility, also export default
export default { get current() { return initTrakt(); } };
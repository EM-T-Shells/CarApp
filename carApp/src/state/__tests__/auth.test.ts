import type { Session } from '@supabase/supabase-js';
import type { User } from '../../types/models';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectIsProvider,
  selectIsCustomer,
} from '../auth';

const baseSession: Session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'user-123',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00Z',
    email: 'test@example.com',
    email_verified: true,
    full_name: 'Test User',
    is_verified: true,
    phone: null,
    phone_verified: false,
    role: 'customer',
    stripe_customer_id: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  useAuthStore.getState().clear();
  useAuthStore.setState({ isHydrating: true });
});

describe('useAuthStore', () => {
  it('starts hydrating with no session or user', () => {
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.role).toBeNull();
    expect(state.isHydrating).toBe(true);
  });

  it('setSession populates session, user, role and finishes hydration', () => {
    const user = makeUser({ role: 'customer' });
    useAuthStore.getState().setSession(baseSession, user);

    const state = useAuthStore.getState();
    expect(state.session).toBe(baseSession);
    expect(state.user).toBe(user);
    expect(state.role).toBe('customer');
    expect(state.isHydrating).toBe(false);
  });

  it('setSession resolves provider role', () => {
    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'provider' }));
    expect(useAuthStore.getState().role).toBe('provider');
  });

  it('setSession resolves both role', () => {
    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'both' }));
    expect(useAuthStore.getState().role).toBe('both');
  });

  it('setSession falls back to customer for unknown role values', () => {
    useAuthStore
      .getState()
      .setSession(baseSession, makeUser({ role: 'weird-role' }));
    expect(useAuthStore.getState().role).toBe('customer');
  });

  it('setSession with null user yields null role but still finishes hydration', () => {
    useAuthStore.getState().setSession(null, null);
    const state = useAuthStore.getState();
    expect(state.role).toBeNull();
    expect(state.isHydrating).toBe(false);
  });

  it('clear resets to signed-out state', () => {
    useAuthStore.getState().setSession(baseSession, makeUser());
    useAuthStore.getState().clear();

    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.role).toBeNull();
    expect(state.isHydrating).toBe(false);
  });

  it('finishHydration flips isHydrating without touching session', () => {
    useAuthStore.getState().finishHydration();
    const state = useAuthStore.getState();
    expect(state.isHydrating).toBe(false);
    expect(state.session).toBeNull();
  });
});

describe('auth selectors', () => {
  it('selectIsAuthenticated reflects session presence', () => {
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(false);
    useAuthStore.getState().setSession(baseSession, makeUser());
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(true);
  });

  it('selectIsProvider is true for provider and both', () => {
    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'provider' }));
    expect(selectIsProvider(useAuthStore.getState())).toBe(true);

    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'both' }));
    expect(selectIsProvider(useAuthStore.getState())).toBe(true);

    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'customer' }));
    expect(selectIsProvider(useAuthStore.getState())).toBe(false);
  });

  it('selectIsCustomer is true for customer and both', () => {
    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'customer' }));
    expect(selectIsCustomer(useAuthStore.getState())).toBe(true);

    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'both' }));
    expect(selectIsCustomer(useAuthStore.getState())).toBe(true);

    useAuthStore.getState().setSession(baseSession, makeUser({ role: 'provider' }));
    expect(selectIsCustomer(useAuthStore.getState())).toBe(false);
  });
});

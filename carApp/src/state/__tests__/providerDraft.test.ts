import {
  useProviderDraftStore,
  PROVIDER_VETTING_STEPS,
  selectStepIndex,
  selectProfileStepComplete,
  selectServicesStepComplete,
  selectAllStepsApproved,
  selectProfileCompleteness,
  type ServicePackageDraft,
} from '../providerDraft';

function makeService(overrides: Partial<ServicePackageDraft> = {}): ServicePackageDraft {
  return {
    catalogId: 'catalog-1',
    name: 'Full Detail',
    category: 'detail',
    basePrice: 15000,
    durationMins: 120,
    description: null,
    isCustom: false,
    ...overrides,
  };
}

beforeEach(() => {
  useProviderDraftStore.getState().reset();
});

describe('useProviderDraftStore — steps', () => {
  it('starts on the profile step', () => {
    expect(useProviderDraftStore.getState().currentStep).toBe('profile');
  });

  it('nextStep walks through all steps and clamps at bank', () => {
    for (let i = 1; i < PROVIDER_VETTING_STEPS.length; i++) {
      useProviderDraftStore.getState().nextStep();
      expect(useProviderDraftStore.getState().currentStep).toBe(
        PROVIDER_VETTING_STEPS[i],
      );
    }
    useProviderDraftStore.getState().nextStep();
    expect(useProviderDraftStore.getState().currentStep).toBe('bank');
  });

  it('prevStep clamps at profile', () => {
    useProviderDraftStore.getState().prevStep();
    expect(useProviderDraftStore.getState().currentStep).toBe('profile');
  });

  it('setStep jumps to a step', () => {
    useProviderDraftStore.getState().setStep('insurance');
    expect(useProviderDraftStore.getState().currentStep).toBe('insurance');
  });
});

describe('useProviderDraftStore — profile', () => {
  it('setProfile merges patches', () => {
    useProviderDraftStore.getState().setProfile({
      providerTypeId: 'type-1',
      bio: 'Experienced mobile detailer',
    });
    useProviderDraftStore.getState().setProfile({ mileRadius: 40 });

    const profile = useProviderDraftStore.getState().profile;
    expect(profile.providerTypeId).toBe('type-1');
    expect(profile.bio).toBe('Experienced mobile detailer');
    expect(profile.mileRadius).toBe(40);
  });
});

describe('useProviderDraftStore — services', () => {
  it('addService adds a new service', () => {
    useProviderDraftStore.getState().addService(makeService());
    expect(useProviderDraftStore.getState().services).toHaveLength(1);
  });

  it('addService deduplicates by catalogId', () => {
    useProviderDraftStore.getState().addService(makeService());
    useProviderDraftStore.getState().addService(makeService());
    expect(useProviderDraftStore.getState().services).toHaveLength(1);
  });

  it('addService allows distinct catalog ids', () => {
    useProviderDraftStore.getState().addService(makeService({ catalogId: 'a' }));
    useProviderDraftStore.getState().addService(makeService({ catalogId: 'b' }));
    expect(useProviderDraftStore.getState().services).toHaveLength(2);
  });

  it('addService deduplicates custom services by name', () => {
    const custom = makeService({ catalogId: null, name: 'Custom Wax', isCustom: true });
    useProviderDraftStore.getState().addService(custom);
    useProviderDraftStore.getState().addService(custom);
    expect(useProviderDraftStore.getState().services).toHaveLength(1);
  });

  it('removeService removes by catalogId', () => {
    useProviderDraftStore.getState().addService(makeService({ catalogId: 'a' }));
    useProviderDraftStore.getState().addService(makeService({ catalogId: 'b' }));
    useProviderDraftStore.getState().removeService('a', 'Full Detail');
    const services = useProviderDraftStore.getState().services;
    expect(services).toHaveLength(1);
    expect(services[0].catalogId).toBe('b');
  });

  it('removeService removes custom service by name', () => {
    useProviderDraftStore
      .getState()
      .addService(makeService({ catalogId: null, name: 'Custom Wax', isCustom: true }));
    useProviderDraftStore.getState().removeService(null, 'Custom Wax');
    expect(useProviderDraftStore.getState().services).toHaveLength(0);
  });

  it('clearServices empties the list', () => {
    useProviderDraftStore.getState().addService(makeService());
    useProviderDraftStore.getState().clearServices();
    expect(useProviderDraftStore.getState().services).toHaveLength(0);
  });
});

describe('useProviderDraftStore — external ids and statuses', () => {
  it('setters update external ids', () => {
    useProviderDraftStore.getState().setPersonaInquiryId('persona-1');
    useProviderDraftStore.getState().setCheckrReportId('checkr-1');
    useProviderDraftStore.getState().setStripeAccountId('acct_123');

    const state = useProviderDraftStore.getState();
    expect(state.personaInquiryId).toBe('persona-1');
    expect(state.checkrReportId).toBe('checkr-1');
    expect(state.stripeAccountId).toBe('acct_123');
  });

  it('setStatus updates a single step status', () => {
    useProviderDraftStore.getState().setStatus('identity', 'submitted');
    useProviderDraftStore.getState().setStatus('background', 'approved');

    const statuses = useProviderDraftStore.getState().statuses;
    expect(statuses.identity).toBe('submitted');
    expect(statuses.background).toBe('approved');
    expect(statuses.bank).toBe('not_started');
  });
});

describe('useProviderDraftStore — reset', () => {
  it('reset wipes profile, services, ids and statuses', () => {
    useProviderDraftStore.getState().setProfile({ bio: 'Some bio' });
    useProviderDraftStore.getState().addService(makeService());
    useProviderDraftStore.getState().setPersonaInquiryId('persona-1');
    useProviderDraftStore.getState().setStatus('identity', 'approved');
    useProviderDraftStore.getState().setStep('bank');

    useProviderDraftStore.getState().reset();

    const state = useProviderDraftStore.getState();
    expect(state.currentStep).toBe('profile');
    expect(state.profile.bio).toBe('');
    expect(state.services).toHaveLength(0);
    expect(state.personaInquiryId).toBeNull();
    expect(state.statuses.identity).toBe('not_started');
  });
});

describe('providerDraft selectors', () => {
  it('selectStepIndex mirrors step order', () => {
    useProviderDraftStore.getState().setStep('services');
    expect(selectStepIndex(useProviderDraftStore.getState())).toBe(1);
  });

  it('selectProfileStepComplete requires type, bio, coverage, radius', () => {
    expect(selectProfileStepComplete(useProviderDraftStore.getState())).toBe(false);

    useProviderDraftStore.getState().setProfile({
      providerTypeId: 'type-1',
      bio: 'I have ten years detailing experience here',
      coverageArea: 'Arlington, VA',
      mileRadius: 20,
    });
    expect(selectProfileStepComplete(useProviderDraftStore.getState())).toBe(true);
  });

  it('selectProfileStepComplete fails on short bio', () => {
    useProviderDraftStore.getState().setProfile({
      providerTypeId: 'type-1',
      bio: 'too short',
      coverageArea: 'Arlington',
      mileRadius: 20,
    });
    expect(selectProfileStepComplete(useProviderDraftStore.getState())).toBe(false);
  });

  it('selectServicesStepComplete requires at least one service', () => {
    expect(selectServicesStepComplete(useProviderDraftStore.getState())).toBe(false);
    useProviderDraftStore.getState().addService(makeService());
    expect(selectServicesStepComplete(useProviderDraftStore.getState())).toBe(true);
  });

  it('selectAllStepsApproved requires every vetting status approved', () => {
    expect(selectAllStepsApproved(useProviderDraftStore.getState())).toBe(false);
    useProviderDraftStore.getState().setStatus('identity', 'approved');
    useProviderDraftStore.getState().setStatus('background', 'approved');
    useProviderDraftStore.getState().setStatus('insurance', 'approved');
    useProviderDraftStore.getState().setStatus('credentials', 'approved');
    expect(selectAllStepsApproved(useProviderDraftStore.getState())).toBe(false);
    useProviderDraftStore.getState().setStatus('bank', 'approved');
    expect(selectAllStepsApproved(useProviderDraftStore.getState())).toBe(true);
  });

  it('selectProfileCompleteness maxes out at 100', () => {
    useProviderDraftStore.getState().setProfile({
      providerTypeId: 'type-1',
      bio: 'Experienced detailer with ten plus years',
      coverageArea: 'Arlington',
      mileRadius: 20,
    });
    useProviderDraftStore.getState().addService(makeService());
    expect(selectProfileCompleteness(useProviderDraftStore.getState())).toBe(100);
  });
});

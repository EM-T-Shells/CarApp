import {
  useSignUpDraftStore,
  SIGN_UP_STEPS,
  selectStepIndex,
  selectProfileComplete,
  selectAddressComplete,
  selectRoleComplete,
  selectVehicleComplete,
} from '../signUpDraft';

beforeEach(() => {
  useSignUpDraftStore.getState().reset();
});

describe('useSignUpDraftStore', () => {
  it('starts on the role step with empty fields', () => {
    const state = useSignUpDraftStore.getState();
    expect(state.currentStep).toBe('role');
    expect(state.fullName).toBe('');
    expect(state.phone).toBe('');
    expect(state.role).toBeNull();
    expect(state.vehicle.year).toBe('');
  });

  it('nextStep advances through all steps and stops at the last', () => {
    useSignUpDraftStore.getState().nextStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('profile');

    useSignUpDraftStore.getState().nextStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('vehicle');

    // Clamps at the last step
    useSignUpDraftStore.getState().nextStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('vehicle');
  });

  it('prevStep walks back and clamps at role', () => {
    useSignUpDraftStore.getState().setStep('vehicle');
    useSignUpDraftStore.getState().prevStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('profile');

    useSignUpDraftStore.getState().prevStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('role');

    useSignUpDraftStore.getState().prevStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('role');
  });

  it('setStep jumps directly to a step', () => {
    useSignUpDraftStore.getState().setStep('vehicle');
    expect(useSignUpDraftStore.getState().currentStep).toBe('vehicle');
  });

  it('setProfile merges contact fields without clobbering others', () => {
    useSignUpDraftStore.getState().setProfile({
      fullName: 'Jane Doe',
      avatarUrl: 'https://cdn/avatar.png',
    });
    useSignUpDraftStore.getState().setProfile({
      phone: '(703) 555-0142',
      city: 'Reston',
    });

    const state = useSignUpDraftStore.getState();
    expect(state.fullName).toBe('Jane Doe');
    expect(state.avatarUrl).toBe('https://cdn/avatar.png');
    expect(state.phone).toBe('(703) 555-0142');
    expect(state.city).toBe('Reston');
  });

  it('setRole assigns role', () => {
    useSignUpDraftStore.getState().setRole('customer');
    expect(useSignUpDraftStore.getState().role).toBe('customer');
  });

  it('setVehicle merges patches into vehicle', () => {
    useSignUpDraftStore.getState().setVehicle({ year: '2022', make: 'Honda' });
    useSignUpDraftStore.getState().setVehicle({ model: 'Civic' });

    const vehicle = useSignUpDraftStore.getState().vehicle;
    expect(vehicle.year).toBe('2022');
    expect(vehicle.make).toBe('Honda');
    expect(vehicle.model).toBe('Civic');
  });

  it('reset returns to initial defaults', () => {
    useSignUpDraftStore.getState().setProfile({ fullName: 'Jane', phone: '5551234567' });
    useSignUpDraftStore.getState().setRole('provider');
    useSignUpDraftStore.getState().setVehicle({ year: '2022' });
    useSignUpDraftStore.getState().setStep('vehicle');

    useSignUpDraftStore.getState().reset();

    const state = useSignUpDraftStore.getState();
    expect(state.currentStep).toBe('role');
    expect(state.fullName).toBe('');
    expect(state.phone).toBe('');
    expect(state.role).toBeNull();
    expect(state.vehicle.year).toBe('');
  });
});

describe('signUpDraft selectors', () => {
  it('selectStepIndex returns the current index', () => {
    expect(selectStepIndex(useSignUpDraftStore.getState())).toBe(0);
    useSignUpDraftStore.getState().setStep('vehicle');
    expect(selectStepIndex(useSignUpDraftStore.getState())).toBe(
      SIGN_UP_STEPS.length - 1,
    );
  });

  it('selectProfileComplete requires a non-trivial name and a phone', () => {
    expect(selectProfileComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setProfile({ fullName: 'Jane Doe' });
    // Name alone is not enough — phone is required.
    expect(selectProfileComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setProfile({ phone: '(703) 555-0142' });
    expect(selectProfileComplete(useSignUpDraftStore.getState())).toBe(true);
  });

  it('selectAddressComplete requires line1, city, state and ZIP', () => {
    expect(selectAddressComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setProfile({
      addressLine1: '123 Main St',
      city: 'Reston',
      state: 'VA',
    });
    expect(selectAddressComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setProfile({ postalCode: '20190' });
    expect(selectAddressComplete(useSignUpDraftStore.getState())).toBe(true);
  });

  it('selectRoleComplete requires a role selection', () => {
    expect(selectRoleComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setRole('customer');
    expect(selectRoleComplete(useSignUpDraftStore.getState())).toBe(true);
  });

  it('selectVehicleComplete requires year, make, model', () => {
    expect(selectVehicleComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setVehicle({ year: '2022', make: 'Honda' });
    expect(selectVehicleComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setVehicle({ model: 'Civic' });
    expect(selectVehicleComplete(useSignUpDraftStore.getState())).toBe(true);
  });
});

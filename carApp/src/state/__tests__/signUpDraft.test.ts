import {
  useSignUpDraftStore,
  SIGN_UP_STEPS,
  selectStepIndex,
  selectProfileComplete,
  selectRoleComplete,
  selectVehicleComplete,
} from '../signUpDraft';

beforeEach(() => {
  useSignUpDraftStore.getState().reset();
});

describe('useSignUpDraftStore', () => {
  it('starts on the profile step with empty fields', () => {
    const state = useSignUpDraftStore.getState();
    expect(state.currentStep).toBe('profile');
    expect(state.fullName).toBe('');
    expect(state.role).toBeNull();
    expect(state.vehicle.year).toBe('');
  });

  it('nextStep advances through all steps and stops at the last', () => {
    useSignUpDraftStore.getState().nextStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('role');

    useSignUpDraftStore.getState().nextStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('vehicle');

    useSignUpDraftStore.getState().nextStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('review');

    // Clamps at the last step
    useSignUpDraftStore.getState().nextStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('review');
  });

  it('prevStep walks back and clamps at profile', () => {
    useSignUpDraftStore.getState().setStep('vehicle');
    useSignUpDraftStore.getState().prevStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('role');

    useSignUpDraftStore.getState().prevStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('profile');

    useSignUpDraftStore.getState().prevStep();
    expect(useSignUpDraftStore.getState().currentStep).toBe('profile');
  });

  it('setStep jumps directly to a step', () => {
    useSignUpDraftStore.getState().setStep('review');
    expect(useSignUpDraftStore.getState().currentStep).toBe('review');
  });

  it('setProfile updates full name and avatar', () => {
    useSignUpDraftStore.getState().setProfile({
      fullName: 'Jane Doe',
      avatarUrl: 'https://cdn/avatar.png',
    });

    const state = useSignUpDraftStore.getState();
    expect(state.fullName).toBe('Jane Doe');
    expect(state.avatarUrl).toBe('https://cdn/avatar.png');
  });

  it('setProfile without avatar nulls the avatar field', () => {
    useSignUpDraftStore.getState().setProfile({ fullName: 'Jane Doe' });
    expect(useSignUpDraftStore.getState().avatarUrl).toBeNull();
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
    useSignUpDraftStore.getState().setProfile({ fullName: 'Jane' });
    useSignUpDraftStore.getState().setRole('provider');
    useSignUpDraftStore.getState().setVehicle({ year: '2022' });
    useSignUpDraftStore.getState().setStep('review');

    useSignUpDraftStore.getState().reset();

    const state = useSignUpDraftStore.getState();
    expect(state.currentStep).toBe('profile');
    expect(state.fullName).toBe('');
    expect(state.role).toBeNull();
    expect(state.vehicle.year).toBe('');
  });
});

describe('signUpDraft selectors', () => {
  it('selectStepIndex returns the current index', () => {
    expect(selectStepIndex(useSignUpDraftStore.getState())).toBe(0);
    useSignUpDraftStore.getState().setStep('review');
    expect(selectStepIndex(useSignUpDraftStore.getState())).toBe(
      SIGN_UP_STEPS.length - 1,
    );
  });

  it('selectProfileComplete requires a non-trivial full name', () => {
    expect(selectProfileComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setProfile({ fullName: 'A' });
    expect(selectProfileComplete(useSignUpDraftStore.getState())).toBe(false);
    useSignUpDraftStore.getState().setProfile({ fullName: 'Jane Doe' });
    expect(selectProfileComplete(useSignUpDraftStore.getState())).toBe(true);
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

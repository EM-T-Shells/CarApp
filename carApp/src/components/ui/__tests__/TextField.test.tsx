// TextField.test.tsx — unit tests for TextField component.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TextField } from '../TextField';

describe('TextField component', () => {
  // ─── Basic Rendering ───────────────────────────────────────────────────────

  it('renders without crashing', () => {
    render(<TextField placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('renders label when provided', () => {
    render(<TextField label="Email" />);
    expect(screen.getByText('Email')).toBeTruthy();
  });

  it('does not render label when omitted', () => {
    const { queryByText } = render(<TextField placeholder="No label" />);
    expect(queryByText('Label')).toBeNull();
  });

  // ─── Error & Hint ─────────────────────────────────────────────────────────

  it('renders error message when provided', () => {
    render(<TextField error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeTruthy();
  });

  it('renders hint text when provided and no error', () => {
    render(<TextField hint="We will never share your email" />);
    expect(screen.getByText('We will never share your email')).toBeTruthy();
  });

  it('hides hint when error is also provided', () => {
    const { queryByText } = render(
      <TextField error="Required" hint="Some hint" />
    );
    expect(screen.getByText('Required')).toBeTruthy();
    expect(queryByText('Some hint')).toBeNull();
  });

  // ─── Icon Slots ───────────────────────────────────────────────────────────

  it('renders left icon when provided', () => {
    const { getByTestId } = render(
      <TextField leftIcon={<></>} testID="tf" />
    );
    expect(getByTestId('tf')).toBeTruthy();
  });

  it('renders right icon when provided and not secureTextEntry', () => {
    const { getByTestId } = render(
      <TextField rightIcon={<></>} testID="tf-right" />
    );
    expect(getByTestId('tf-right')).toBeTruthy();
  });

  // ─── Secure Text Entry ────────────────────────────────────────────────────

  it('renders show/hide toggle when secureTextEntry is true', () => {
    render(<TextField secureTextEntry />);
    expect(screen.getByText('Show')).toBeTruthy();
  });

  it('toggles visibility label when show/hide is pressed', () => {
    render(<TextField secureTextEntry />);
    const toggle = screen.getByText('Show');
    fireEvent.press(toggle);
    expect(screen.getByText('Hide')).toBeTruthy();
  });

  it('does not render show/hide toggle when secureTextEntry is false', () => {
    const { queryByText } = render(<TextField secureTextEntry={false} />);
    expect(queryByText('Show')).toBeNull();
    expect(queryByText('Hide')).toBeNull();
  });

  // ─── Disabled State ───────────────────────────────────────────────────────

  it('marks input as non-editable when disabled', () => {
    const { getByPlaceholderText } = render(
      <TextField placeholder="Disabled input" disabled />
    );
    const input = getByPlaceholderText('Disabled input');
    expect(input.props.editable).toBe(false);
  });

  it('sets accessibility disabled state when disabled', () => {
    const { getByPlaceholderText } = render(
      <TextField placeholder="Disabled" disabled />
    );
    const input = getByPlaceholderText('Disabled');
    expect(input.props.accessibilityState.disabled).toBe(true);
  });

  // ─── Focus / Blur ─────────────────────────────────────────────────────────

  it('calls onFocus when input is focused', () => {
    const onFocus = jest.fn();
    const { getByPlaceholderText } = render(
      <TextField placeholder="Focus me" onFocus={onFocus} />
    );
    fireEvent(getByPlaceholderText('Focus me'), 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('calls onBlur when input loses focus', () => {
    const onBlur = jest.fn();
    const { getByPlaceholderText } = render(
      <TextField placeholder="Blur me" onBlur={onBlur} />
    );
    fireEvent(getByPlaceholderText('Blur me'), 'blur');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  // ─── Multiline ────────────────────────────────────────────────────────────

  it('renders as multiline when multiline prop is set', () => {
    const { getByPlaceholderText } = render(
      <TextField placeholder="Multiline input" multiline />
    );
    const input = getByPlaceholderText('Multiline input');
    expect(input.props.multiline).toBe(true);
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('sets accessibilityLabel from label prop', () => {
    const { getByLabelText } = render(<TextField label="Full name" />);
    expect(getByLabelText('Full name')).toBeTruthy();
  });

  // ─── Value / onChange ─────────────────────────────────────────────────────

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <TextField placeholder="Type here" onChangeText={onChangeText} />
    );
    fireEvent.changeText(getByPlaceholderText('Type here'), 'hello');
    expect(onChangeText).toHaveBeenCalledWith('hello');
  });
});

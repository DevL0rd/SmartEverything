import { describe, expect, it } from 'vitest';
import {
  AccumulatedUpdatesPluginError,
  enableAccumulatedUpdates,
} from './with-accumulated-updates';

const MAIN_APPLICATION = `package com.example
import android.app.Application

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactHost

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }
}
`;

describe('enableAccumulatedUpdates', () => {
  it('overrides the flag right after React Native loads and before the lifecycle dispatch', () => {
    const patched = enableAccumulatedUpdates(MAIN_APPLICATION);
    const load = patched.indexOf('loadReactNative(this)');
    const override = patched.indexOf('ReactNativeFeatureFlags.dangerouslyForceOverride(');
    const dispatch = patched.indexOf('ApplicationLifecycleDispatcher');
    expect(load).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(load);
    expect(dispatch).toBeGreaterThan(override);
    expect(patched).toContain(
      'override fun enableAccumulatedUpdatesInRawPropsAndroid(): Boolean = true',
    );
  });

  it('imports the two classes it uses', () => {
    const patched = enableAccumulatedUpdates(MAIN_APPLICATION);
    expect(patched).toContain(
      'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags\n',
    );
    expect(patched).toContain(
      'import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults\n',
    );
  });

  it('changes nothing on a second run', () => {
    const once = enableAccumulatedUpdates(MAIN_APPLICATION);
    expect(enableAccumulatedUpdates(once)).toBe(once);
  });

  it('fails loudly when the template no longer has the load call', () => {
    const changed = MAIN_APPLICATION.replace('    loadReactNative(this)\n', '');
    expect(() => enableAccumulatedUpdates(changed)).toThrow(AccumulatedUpdatesPluginError);
  });

  it('fails loudly when the template no longer has the host import', () => {
    const changed = MAIN_APPLICATION.replace('import com.facebook.react.ReactHost\n', '');
    expect(() => enableAccumulatedUpdates(changed)).toThrow(AccumulatedUpdatesPluginError);
  });
});

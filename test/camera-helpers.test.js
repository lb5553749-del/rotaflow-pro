'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isPhotoPickCancelled,
  clampMaxPhotos,
  canUseNativeMultiCamera,
  canUseGetUserMediaMulti,
  canUseInAppMultiCamera,
  isCameraPermissionGranted,
  multicamFrameSize,
  filePickLimit
} = require('../lib/camera-helpers.js');

describe('isPhotoPickCancelled', () => {
  it('detects cancel / denied / no image messages', () => {
    assert.equal(isPhotoPickCancelled(new Error('User cancelled photos app')), true);
    assert.equal(isPhotoPickCancelled('user denied'), true);
    assert.equal(isPhotoPickCancelled({ message: 'No image picked' }), true);
    assert.equal(isPhotoPickCancelled('picker was cancelled'), true);
    assert.equal(isPhotoPickCancelled(new Error('disk full')), false);
  });
});

describe('clampMaxPhotos', () => {
  it('clamps to [1, photoMax]', () => {
    assert.equal(clampMaxPhotos(3, 15), 3);
    assert.equal(clampMaxPhotos(99, 15), 15);
    assert.equal(clampMaxPhotos(0, 15), 15);
    assert.equal(clampMaxPhotos(undefined, 15, { multipleFallback: 12 }), 12);
  });
});

describe('capability helpers', () => {
  it('gates native multi-cam', () => {
    assert.equal(canUseNativeMultiCamera({ isNative: true, hasOpenMultiCamera: true }), true);
    assert.equal(canUseNativeMultiCamera({ isNative: true, hasOpenMultiCamera: false }), false);
    assert.equal(canUseNativeMultiCamera({ isNative: false, hasOpenMultiCamera: true }), false);
  });

  it('blocks getUserMedia multi on native', () => {
    assert.equal(canUseGetUserMediaMulti({ isNative: true, hasGetUserMedia: true }), false);
    assert.equal(canUseGetUserMediaMulti({ isNative: false, hasGetUserMedia: true }), true);
  });

  it('in-app multi is native OR web', () => {
    assert.equal(canUseInAppMultiCamera({ isNative: true, hasOpenMultiCamera: true }), true);
    assert.equal(canUseInAppMultiCamera({ isNative: false, hasGetUserMedia: true }), true);
    assert.equal(canUseInAppMultiCamera({ isNative: true, hasGetUserMedia: true }), false);
  });
});

describe('isCameraPermissionGranted', () => {
  it('accepts granted and limited', () => {
    assert.equal(isCameraPermissionGranted({ camera: 'granted' }), true);
    assert.equal(isCameraPermissionGranted({ camera: 'limited' }), true);
    assert.equal(isCameraPermissionGranted({ camera: 'denied' }), false);
    assert.equal(isCameraPermissionGranted(null), false);
  });
});

describe('multicamFrameSize / filePickLimit', () => {
  it('scales video frame into maxSide', () => {
    assert.deepEqual(multicamFrameSize(2000, 1000, 1280), { w: 1280, h: 640 });
    assert.deepEqual(multicamFrameSize(800, 600, 1280), { w: 800, h: 600 });
    assert.equal(multicamFrameSize(0, 600, 1280), null);
  });

  it('limits file picks', () => {
    assert.equal(filePickLimit(20, 15, true), 12);
    assert.equal(filePickLimit(20, 5, true), 5);
    assert.equal(filePickLimit(20, 15, false), 1);
  });
});

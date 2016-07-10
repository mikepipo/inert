/**
 *
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const expect = chai.expect;
const fixture = new Fixture();

function isUnfocusable(el) {
  var oldActiveElement = document.activeElement;
  el.focus();
  if (document.activeElement !== oldActiveElement)
    return false;
  if (document.activeElement === el)
    return false;
  if (el.tabIndex !== -1)
    return false;
  return true;
}

describe('Basic', function() {

  describe('Element.prototype', function() {
    it('should patch the Element prototype', function() {
      expect(Element.prototype.hasOwnProperty('inert')).to.be.ok;
    });
  });

  describe('children of declaratively inert parent', function() {
    beforeEach(function(done) {
      fixture.load('fixtures/basic.html', done);
    });

    afterEach(function() {
      fixture.destroy();
    });

    it('should have no effect on elements outside inert region', function() {
      const button = document.querySelector('#non-inert');
      expect(isUnfocusable(button)).to.equal(false);
    });

    it('should make implicitly focusable child not focusable', function() {
      const button = document.querySelector('[inert] button');
      expect(isUnfocusable(button)).to.equal(true);
    });

    it('should make explicitly focusable child not focusable', function() {
      const div = document.querySelector('#fake-button');
      expect(div.hasAttribute('tabindex')).to.equal(false);
      expect(isUnfocusable(div)).to.equal(true);
    });

    it('programmatically setting inert to false should remove attribute and un-inert content', function() {
      const inertContainer = document.querySelector('[inert]');
      expect(inertContainer.hasAttribute('inert')).to.equal(true);
      expect(inertContainer.inert).to.equal(true);
      const button = inertContainer.querySelector('button');
      expect(isUnfocusable(button)).to.equal(true);

      inertContainer.inert = false;
      expect(inertContainer.hasAttribute('inert')).to.equal(false);
      expect(inertContainer.inert).to.equal(false);
      expect(isUnfocusable(button)).to.equal(false);
    });

    it('should be able to be reapplied multiple times', function() {
      const inertContainer = document.querySelector('[inert]');
      const button = document.querySelector('[inert] button');
      expect(isUnfocusable(button)).to.equal(true);

      inertContainer.inert = false;
      expect(isUnfocusable(button)).to.equal(false);

      inertContainer.inert = true;
      expect(isUnfocusable(button)).to.equal(true);

      inertContainer.inert = false;
      expect(isUnfocusable(button)).to.equal(false);

      inertContainer.inert = true;
      expect(isUnfocusable(button)).to.equal(true);
    });

    it('should apply to dynamically added content', function(done) {
      const newButton = document.createElement('button');
      newButton.textContent = 'Click me too';
      const inertContainer = document.querySelector('[inert]');
      inertContainer.appendChild(newButton);
      Promise.resolve().then(() => {
        expect(isUnfocusable(newButton)).to.equal(true);
        done();
      });
    });

    it('should be detected on dynamically added content', function(done) {
      const temp = document.createElement('div');
      const fixture = document.querySelector('#fixture');
      fixture.appendChild(temp);
      expect(temp.parentElement).to.eql(fixture);
      temp.outerHTML = '<div id="inert2" inert><button>Click me</button></div>';
      const div = fixture.querySelector('#inert2');
      Promise.resolve().then(() => {
        expect(div.inert).to.equal(true);
        const button = div.querySelector('button');
        expect(isUnfocusable(button)).to.equal(true);
        done();
      });
    });
  });

  describe('nested inert regions', function() {
    beforeEach(function(done) {
      fixture.load('fixtures/nested.html', done);
    });

    afterEach(function() {
      fixture.destroy();
    });

    it('should apply regardless of how many deep the nesting is', function() {
      const outerButton = document.querySelector('#outer-button');
      expect(isUnfocusable(outerButton)).to.equal(true);
      const outerFakeButton = document.querySelector('#outer-fake-button');
      expect(isUnfocusable(outerButton)).to.equal(true);

      const innerButton = document.querySelector('#inner-button');
      expect(isUnfocusable(innerButton)).to.equal(true);
      const innerFakeButton = document.querySelector('#inner-fake-button');
      expect(isUnfocusable(innerFakeButton)).to.equal(true);
    });

    it('should still apply if inner inert is removed', function() {
      document.querySelector('#inner').inert = false;

      const outerButton = document.querySelector('#outer-button');
      expect(isUnfocusable(outerButton)).to.equal(true);
      const outerFakeButton = document.querySelector('#outer-fake-button');
      expect(isUnfocusable(outerButton)).to.equal(true);

      const innerButton = document.querySelector('#inner-button');
      expect(isUnfocusable(innerButton)).to.equal(true);
      const innerFakeButton = document.querySelector('#inner-fake-button');
      expect(isUnfocusable(innerFakeButton)).to.equal(true);
    });

    it('should still apply to inner content if outer inert is removed', function() {
      document.querySelector('#outer').inert = false;

      const outerButton = document.querySelector('#outer-button');
      expect(isUnfocusable(outerButton)).to.equal(false);
      const outerFakeButton = document.querySelector('#outer-fake-button');
      expect(isUnfocusable(outerButton)).to.equal(false);

      const innerButton = document.querySelector('#inner-button');
      expect(isUnfocusable(innerButton)).to.equal(true);
      const innerFakeButton = document.querySelector('#inner-fake-button');
      expect(isUnfocusable(innerFakeButton)).to.equal(true);
    });

    it('should be detected on dynamically added content within an inert root', function(done) {
      const temp = document.createElement('div');
      const outerContainer = document.querySelector('#outer');
      outerContainer.appendChild(temp);
      expect(temp.parentElement).to.eql(outerContainer);
      temp.outerHTML = '<div id="inner2" inert><button>Click me</button></div>';
      const div = outerContainer.querySelector('#inner2');
      Promise.resolve().then(() => {
        expect(div.inert).to.equal(true);
        const button = div.querySelector('button');
        expect(isUnfocusable(button)).to.equal(true);

        // un-inerting outer container doesn't mess up the new inner container
        outerContainer.inert = false;
        expect(div.inert).to.equal(true);
        expect(isUnfocusable(button)).to.equal(true);
        done();
      });
    });

  });
});

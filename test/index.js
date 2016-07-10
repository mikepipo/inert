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

    it('should make implicitly focusable child not focusable', function() {
      const button = document.querySelector('#fixture button');
      expect(button.tabIndex).to.equal(-1);
    });

    it('should make explicitly focusable child not focusable', function() {
      const div = document.querySelector('#fake-button');
      expect(div.tabIndex).to.equal(-1);
      expect(div.hasAttribute('tabindex')).to.not.be.ok();
    });

  });

});


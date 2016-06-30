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

class InertWrapper {
  constructor(root) {
    if (!root) {
      throw new Error('Missing required argument; InertWrapper needs to wrap an Element.');
    }
    this._root = root;
    this.inert = true;
    this._savedNodes = [];
  }

  static get _focusableElementsString() {
    return 'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,[contenteditable]';
  }

  get inert() {
    return this._inert;
  }

  makeNodeInert(node) {
    // Skip subtrees which already have 'inert' set
    if (node.hasAttribute('inert'))
      return false;

    var nodeData = { node: node };
    if (node.matches(InertWrapper._focusableElementsString)) {
      if (node.hasAttribute('tabindex'))
        nodeData.savedTabIndex = node.tabIndex;
      node.setAttribute('tabindex', '-1');
      this._savedNodes.push({node: node, });
    } else if (node.hasAttribute('tabindex')) {
      nodeData.savedTabIndex = node.tabIndex;
      node.removeAttribute('tabindex');
    }
    this._savedNodes.push(nodeData);

    return true;
  }

  makeInert() {
    InertWrapper.composedTreeWalk(this._root, { preorder: (node) => { makeNodeInert(node) } });
  }

  makeNodeErt(nodeData) {
    var node = nodeData.node;
    if ('savedTabIndex' in nodeData)
      node.setAttribute('tabindex', savedTabIndex);
    else
      node.removeAttribute('tabindex');
    return true;
  }

  set inert(isInert) {
    if (this._inert === isInert) {
      return;
    }

    this._inert = isInert;
    if (isInert)
      makeInert();
    else
      makeNonInert();

    this._focusableElements.forEach((child) => {
      if (isInert) {
        // If the child has an explict tabindex save it
        if (child.hasAttribute('tabindex')) {
          child.__savedTabIndex = child.tabIndex;
        }
        // Set ALL focusable children to tabindex -1
        child.setAttribute('tabindex', -1);
      } else {
        // If the child has a saved tabindex, restore it
        // Because the value could be 0, explicitly check that it's not false
        if (child.__savedTabIndex === 0 || child.__savedTabIndex) {
          return child.setAttribute('tabindex', child.__savedTabIndex);
        } else {
          // Remove tabindex from ANY REMAINING children
          child.removeAttribute('tabindex');
        }
      }
    });
  }

  /**
   * Recursively walk the composed tree from |node|, aborting if |end| is encountered.
   * @param {Node} node
   * @param {{preorder: (function (Node):boolean|undefined),
   *          postorder: (function (Node)|undefined)}} callbacks
   *     Callbacks to be called for each element traversed, excluding
   *     |end|. Possible callbacks are |preorder|, called before descending into
   *     child nodes, and |postorder| called after all child nodes have been
   *     traversed. If |preorder| returns false, its child nodes will not be
   *     traversed.
   * @param {ShadowRoot=} opt_shadowRoot The nearest ShadowRoot ancestor, if any.
   * @return {boolean} Whether |end| was found, if provided.
   */
  static function composedTreeWalk(node, callbacks, opt_shadowRoot) {
    if (node === end)
      return true;

    if (node.nodeType == Node.ELEMENT_NODE)
      var element = /** @type {Element} */ (node);

    var found = false;

    if (element && callbacks.preorder) {
      if (!callbacks.preorder(element))
        return found;
    }

    // Descend into node:
    // If it has a ShadowRoot, ignore all child elements - these will be picked
    // up by the <content> or <shadow> elements. Descend straight into the
    // ShadowRoot.
    if (element) {
      var shadowRoot = element.shadowRoot || element.webkitShadowRoot;
      if (shadowRoot) {
        found = axs.dom.composedTreeSearch(shadowRoot,
                                           end,
                                           callbacks,
                                           shadowRoot);
        if (element && callbacks.postorder && !found)
          callbacks.postorder(element);
        return found;
      }
    }

    // If it is a <content> element, descend into distributed elements - these
    // are elements from outside the shadow root which are rendered inside the
    // shadow DOM.
    if (element && element.localName == 'content') {
      var content = /** @type {HTMLContentElement} */ (element);
      var distributedNodes = content.getDistributedNodes();
      for (var i = 0; i < distributedNodes.length && !found; i++) {
        found = axs.dom.composedTreeSearch(distributedNodes[i],
                                           end,
                                           callbacks,
                                           opt_shadowRoot);
      }
      if (element && callbacks.postorder && !found)
        callbacks.postorder.call(null, element);
      return found;
    }

    // If it is neither the parent of a ShadowRoot, a <content> element, nor
    // a <shadow> element recurse normally.
    var child = node.firstChild;
    while (child != null && !found) {
      found = axs.dom.composedTreeSearch(child,
                                         end,
                                         callbacks,
                                         opt_shadowRoot);
      child = child.nextSibling;
    }

    if (element && callbacks.postorder && !found)
      callbacks.postorder.call(null, element);
    return found;
  }

}

function observe(records, self) {
  for (var record of records) {
    if (record.type != 'attributes')
      continue;
    if (record.attributeName != 'inert')
      continue;
    var target = record.target;
    if (target.detabinator === undefined)
        target.detabinator = new Detabinator(target);
    var inert = target.hasAttribute('inert');
    target.detabinator.inert = inert;
    if (inert)
      target.setAttribute('aria-hidden', 'true');
    else
      target.removeAttribute('aria-hidden')
  }
}

var observer = new MutationObserver(observe);
observer.observe(document.body, { attributes: true, subtree: true });

var inertElements = document.querySelectorAll('[inert]');
for (var i = 0; i < inertElements.length; i++) {
  var inertElement = inertElements[i];
  inertElement.detabinator = new Detabinator(inertElement);
  inertElement.detabinator.inert = true;
  inertElement.setAttribute('aria-hidden', 'true');
}

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

(function(document) {

/** @type {string} */
const _focusableElementsString = ['a[href]',
                                  'area[href]',
                                  'input:not([disabled])',
                                  'select:not([disabled])',
                                  'textarea:not([disabled])',
                                  'button:not([disabled])',
                                  'iframe',
                                  'object',
                                  'embed',
                                  '[contenteditable]'].join(',');

/**
 * `InertRoot` manages a single inert subtree, i.e. a DOM subtree whose root element has an `inert`
 * attribute.
 *
 * Its main functions are:
 *
 * - to create and maintain a set of managed `InertElement`s, including when mutations occur in the
 *   subtree. The `makeSubtreeUnfocusable()` method handles collecting `InertElement`s via
 *   registering each focusable element in the subtree with the singleton `InertManager` which
 *   manages all known focusable elements within inert subtrees. `InertManager` ensures that a
 *   single `InertElement` instance exists for each focusable element which has at least one inert
 *   root as an ancestor.
 *
 * - to notify all managed `InertElement`s when this subtree stops being inert (i.e. when the
 *   `inert` attribute is removed from the root element). This is handled in the destructor, which
 *   calls the `deregister` method on `InertManager` for each managed inert element.
 */
class InertRoot {
  /**
   * @param {Element} rootElement The Element at the root of the inert subtree.
   * @param {InertManager} inertManager The global singleton InertManager object.
   */
  constructor(rootElement, inertManager) {
    /** @type {InertManager} */
    this._inertManager = inertManager;

    /** @type {Element} */
    this._rootElement = rootElement;

    /**
     * @type {Set<Element>}
     * All managed focusable elements in this InertRoot's subtree.
     */
    this._managedElements = new Set([]);

    // Make the subtree hidden from assistive technology
    this._rootElement.setAttribute('aria-hidden', 'true');

    // Make all focusable elements in the subtree unfocusable and add them to _managedElements
    this._makeSubtreeUnfocusable(this._rootElement);

    // Watch for:
    // - any additions in the subtree: make them unfocusable too any removals from the subtree:
    // - remove them from this inert root's managed elements attribute changes: if `tabindex` is
    // - added, or removed from an intrinsically focusable element, make that element a managed
    //   element.
    this._observer = new MutationObserver(this._onMutation.bind(this));
    this._observer.observe(this._rootElement, { attributes: true, childList: true, subtree: true });
  }

  /**
   * Call this whenever this object is about to become obsolete.  This unwinds all of the state
   * stored in this object and updates the state of all of the managed elements.
   */
  destructor() {
    this._observer.disconnect();
    delete this._observer;

    if (this._rootElement)
      this._rootElement.removeAttribute('aria-hidden');
    delete this._rootElement;

    for (let inertElement of this._managedElements)
      this._unmanageNode(inertElement.element);

    delete this._managedElements;

    delete this._inertManager;
  }

  /**
   * @return {Set<InertElement>} A copy of this InertRoot's managed elements set.
   */
  get managedElements() {
    return new Set(this._managedElements);
  }

  /**
   * @param {Node} startNode
   */
  _makeSubtreeUnfocusable(startNode) {
    composedTreeWalk(startNode, (node) => { this._visitNode(node); });
  }

  /**
   * @param {Node} node
   */
  _visitNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE)
      return;

    // If a descendant inert root becomes un-inert, its descendants will still be inert because of
    // this inert root, so all of its managed nodes need to be adopted by this InertRoot.
    if (node !== this._rootElement && node.hasAttribute('inert'))
      this._adoptInertRoot(node);

    if (node.matches(_focusableElementsString) || node.hasAttribute('tabindex'))
      this._manageElement(node);
  }

  /**
   * Register the given element with this InertRoot and with InertManager.
   * @param {Element} element
   */
  _manageElement(element) {
    const inertElement = this._inertManager.register(element, this);
    this._managedElements.add(inertElement);
  }

  /**
   * If the given node corresponds to an `InertElement`, de-associate it with this `InertRoot`.
   * @param {Node} node
   */
  _unmanageNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE)
      return;

    const inertElement = this._inertManager.deregister(node, this);
    if (inertElement)
      this._managedElements.delete(inertElement);
  }

  /**
   * Unregister the entire subtree starting at `startNode`.
   * @param {Node} startNode
   */
  _unmanageSubtree(startNode) {
    composedTreeWalk(startNode, (node) => { this._unmanageNode(node); });
  }

  /**
   * If a descendant element is found with an `inert` attribute, adopt its managed elements.
   * @param {Element} element
   */
  _adoptInertRoot(element) {
    let inertSubroot = this._inertManager.getInertRoot(element);

    // During initialisation this inert root may not have been registered yet,
    // so register it now if need be.
    if (!inertSubroot) {
      this._inertManager.setInert(element, true);
      inertSubroot = this._inertManager.getInertRoot(element);
    }

    for (let savedInertElement of inertSubroot.managedElements)
      this._manageElement(savedInertElement.element);
  }

  /**
   * Callback used when mutation observer detects subtree additions, removals, or attribute changes.
   * @param {MutationRecord} records
   * @param {MutationObserver} self
   */
  _onMutation(records, self) {
    for (let record of records) {
      const target = record.target;
      if (record.type === 'childList') {
        // Manage added nodes
        for (let node of Array.from(record.addedNodes))
          this._makeSubtreeUnfocusable(node);

        // Un-manage removed nodes
        for (let node of Array.from(record.removedNodes))
          this._unmanageSubtree(node);
      } else if (record.type === 'attributes') {
        if (record.attributeName === 'tabindex') {
          // Re-initialise inert element if tabindex changes
          this._manageElement(target);
        } else if (target !== this._rootElement &&
                   record.attributeName === 'inert' &&
                   target.hasAttribute('inert')) {
          // If a new inert root is added, adopt its managed elements and make sure it knows about
          // the already managed elements from this inert subroot.
          this._adoptInertRoot(target);
          let inertSubroot = this._inertManager.getInertRoot(target);
          for (let managedElement of this._managedElements) {
            if (target.contains(managedElement.element))
              inertSubroot._manageElement(managedElement.element);
          }
        }
      }
    }
  }
}

/**
 * `InertElement` initialises and manages a single inert element.  An element is inert if it is a
 * descendant of one or more inert root elements, and would otherwise be a focusable element.
 *
 * On construction, `InertElement` saves the existing `tabindex` value for the element, if any, and
 * either removes the `tabindex` attribute or sets it to `-1`, depending on whether the element is
 * intrinsically focusable or not.
 *
 * `InertElement` maintains a set of `InertRoot`s which are descendants of this `InertElement`. When
 * an `InertRoot` is destroyed, and calls `InertManager.deregister()`, the `InertManager` notifies
 * the `InertElement` via `removeInertRoot()`, which in turn destroys the `InertElement` if no
 * `InertRoot`s remain in the set. On destruction, `InertElement` reinstates the stored `tabindex`
 * if one exists, or removes the `tabindex` attribute if the element is intrinsically focusable.
 */
class InertElement {
  /**
   * @param {Element} element A focusable element to be made inert.
   * @param {InertRoot} inertRoot The inert root element associated with this inert element.
   */
  constructor(element, inertRoot) {
    /** @type {Element} */
    this._element = element;

    /** @type {boolean} */
    this._overrodeFocusMethod = false;

    /**
     * @type {Set<InertRoot>} The set of descendant inert roots.
     *    If and only if this set becomes empty, this element is no longer inert.
     */
    this._inertRoots = new Set([inertRoot]);

    /** @type {boolean} */
    this._destroyed = false;

    // Save any prior tabindex info and make this element untabbable
    this.ensureUntabbable();
  }

  /**
   * Call this whenever this object is about to become obsolete.
   * This makes the managed element focusable again and deletes all of the previously stored state.
   */
  destructor() {
    this._throwIfDestroyed();

    if (this._element) {
      if (this.hasSavedTabIndex)
        this._element.setAttribute('tabindex', this.savedTabIndex);
      else
        this._element.removeAttribute('tabindex');

      if (this._overrodeFocusMethod)
        delete this._element.focus;
    }
    delete this._element;
    delete this._inertRoots;

    this._destroyed = true;
  }

  /**
   * @type {boolean} Whether this object is obsolete because the managed element is no longer inert.
   * If the object has been destroyed, any attempt to access it will cause an exception.
   */
  get destroyed() {
    return this._destroyed;
  }

  _throwIfDestroyed() {
    if (this.destroyed)
      throw new Error("Trying to access destroyed InertElement");
  }

  /** @return {boolean} */
  get hasSavedTabIndex() {
    return '_savedTabIndex' in this;
  }

  /** @return {Element} */
  get element() {
    this._throwIfDestroyed;
    return this._element;
  }

  /** @param {number} tabIndex */
  set savedTabIndex(tabIndex) {
    this._throwIfDestroyed();
    this._savedTabIndex = tabIndex;
  }

  /** @return {number} */
  get savedTabIndex() {
    this._throwIfDestroyed();
    return this._savedTabIndex;
  }

  /** Save the existing tabindex value and make the element untabbable and unfocusable */
  ensureUntabbable() {
    const element = this.element;
    element.blur();  // TODO(alice): is this right?
    if (element.matches(_focusableElementsString)) {
      if (element.tabIndex === -1 && this.hasSavedTabIndex)
        return;

      if (element.hasAttribute('tabindex'))
        this._savedTabIndex = element.tabIndex;
      element.setAttribute('tabindex', '-1');
      element.focus = function() {};
      this._overrodeFocusMethod = true;
    } else if (element.hasAttribute('tabindex')) {
      this._savedTabIndex = element.tabIndex;
      element.removeAttribute('tabindex');
    }
  }

  /**
   * Add another inert root to this inert element's set of managing inert roots.
   * @param {InertRoot} inertRoot
   */
  addInertRoot(inertRoot) {
    this._throwIfDestroyed();
    this._inertRoots.add(inertRoot);
  }

  /**
   * Remove the given inert root from this inert element's set of managing inert roots.
   * If the set of managing inert roots becomes empty, this element is no longer inert,
   * so the object should be destroyed.
   * @param {InertRoot} inertRoot
   */
  removeInertRoot(inertRoot) {
    this._throwIfDestroyed();
    this._inertRoots.delete(inertRoot);
    if (this._inertRoots.size === 0)
      this.destructor();
  }
}

/**
 * InertManager is a per-document singleton object which manages all inert roots and elements.
 *
 * When an element becomes an inert root by having an `inert` attribute set and/or its `inert`
 * property set to `true`, the `setInert` method creates an `InertRoot` object for the element.
 * The `InertRoot` in turn registers itself as managing all of the element's focusable descendant
 * elements via the `register()` method. The `InertManager` ensures that a single `InertElement`
 * instance is created for each such element, via the `_managedElements` map.
 */
class InertManager {
  /**
   * @param {Document} document
   */
  constructor(document) {
    if (!document)
      throw new Error('Missing required argument; InertManager needs to wrap a document.');

    /** @type {Document} */
    this._document = document;

    /**
     * All managed elements known to this InertManager. In a map to allow looking up by Element.
     * @type {Map<Element, InertElement>}
     */
    this._managedElements = new Map();

    /**
     * All inert roots known to this InertManager. In a map to allow looking up by Element.
     * @type {Map<Element, InertRoot>}
     */
    this._inertRoots = new Map();

    // Find all inert roots in document and make them actually inert.
    let inertElements = Array.from(document.querySelectorAll('[inert]'));
    for (let inertElement of inertElements)
      this.setInert(inertElement, true);

    // Comment these two lines out to use programmatic API only
    this._observer = new MutationObserver(this._watchForInert.bind(this));
    this._observer.observe(document.body, { attributes: true, subtree: true, childList: true });
  }

  /**
   * Set whether the given element should be an inert root or not.
   * @param {Element} root
   * @param {boolean} inert
   */
  setInert(root, inert) {
    if (inert) {
      if (this._inertRoots.has(root))   // element is already inert
        return;

      let inertRoot = new InertRoot(root, this);
      root.setAttribute('inert', '');
      this._inertRoots.set(root, inertRoot);
    } else {
      if (!this._inertRoots.has(root))  // element is already non-inert
        return;

      let inertRoot = this._inertRoots.get(root);
      inertRoot.destructor();
      this._inertRoots.delete(root);
      root.removeAttribute('inert');
    }
  }

  /**
   * Get the InertRoot object corresponding to the given inert root element, if any.
   * @param {Element} element
   * @return {InertRoot?}
   */
  getInertRoot(element) {
    return this._inertRoots.get(element);
  }

  /**
   * Register the given InertRoot as managing the given element.
   * In the case where the element has a previously existing inert root, this inert root will
   * be added to its set of inert roots.
   * @param {Element} element
   * @param {InertRoot} inertRoot
   * @return {InertElement} inertElement
   */
  register(element, inertRoot) {
    let inertElement = this._managedElements.get(element);
    if (inertElement !== undefined) {  // element was already in an inert subtree
      inertElement.addInertRoot(inertRoot);
      // Update saved tabindex value if necessary
      inertElement.ensureUntabbable();
    } else {
      inertElement = new InertElement(element, inertRoot);
    }

    this._managedElements.set(element, inertElement);

    return inertElement;
  }

  /**
   * De-register the given InertRoot as managing the given inert element.
   *
   * Removes the inert root from the InertElement's set of managing inert roots, and remove the
   * inert element from the InertManager's set of managed elements if it is destroyed.
   *
   * If the element is not currently managed, this is essentially a no-op.
   * @param {Element} element
   * @param {InertRoot} inertRoot
   * @return {InertElement?} The potentially destroyed InertElement associated with this element,
   *     if any.
   */
  deregister(element, inertRoot) {
    const inertElement = this._managedElements.get(element);
    if (!inertElement)
      return null;

    inertElement.removeInertRoot(inertRoot);
    if (inertElement.destroyed)
      this._managedElements.delete(element);

    return inertElement;
  }


  /**
   * Callback used when mutation observer detects attribute changes.
   * @param {MutationRecord} records
   * @param {MutationObserver} self
   */
  _watchForInert(records, self) {
    for (let record of records) {
      switch (record.type) {
      case 'childList':
        for (let node of Array.from(record.addedNodes)) {
          if (node.nodeType !== Node.ELEMENT_NODE)
            continue;
          let inertElements = Array.from(node.querySelectorAll('[inert]'));
          if (node.matches('[inert]'))
            inertElements.unshift(node);
          for (let inertElement of inertElements)
            this.setInert(inertElement, true);
        }
        break;
      case 'attributes':
        if (record.attributeName !== 'inert')
          continue;
        let target = record.target;
        let inert = target.hasAttribute('inert');
        this.setInert(target, inert);
        break;
      }
    }
  }
}

 /**
  * Recursively walk the composed tree from |node|.
  * @param {Node} node
  * @param {(function (Element))=} callback Callback to be called for each element traversed,
  *     before descending into child nodes.
  * @param {ShadowRoot=} shadowRootAncestor The nearest ShadowRoot ancestor, if any.
  */
function composedTreeWalk(node, callback, shadowRootAncestor) {
  let element = undefined;
  if (node.nodeType == Node.ELEMENT_NODE)
    element = /** @type {Element} */ (node);

  if (element && callback)
    callback(element)

  // Descend into node:
  // If it has a ShadowRoot, ignore all child elements - these will be picked
  // up by the <content> or <shadow> elements. Descend straight into the
  // ShadowRoot.
  if (element) {
    let shadowRoot = element.shadowRoot || element.webkitShadowRoot;
    if (shadowRoot) {
      composedTreeWalk(shadowRoot, callback, shadowRoot);
      return;
    }
  }

  // If it is a <content> element, descend into distributed elements - these
  // are elements from outside the shadow root which are rendered inside the
  // shadow DOM.
  if (element && element.localName == 'content') {
    let content = /** @type {HTMLContentElement} */ (element);
    let distributedNodes = content.getDistributedNodes();
    for (let i = 0; i < distributedNodes.length; i++) {
      composedTreeWalk(distributedNodes[i], callback, shadowRootAncestor);
    }
    return;
  }

  // If it is neither the parent of a ShadowRoot, a <content> element, nor
  // a <shadow> element recurse normally.
  let child = node.firstChild;
  while (child != null) {
    composedTreeWalk(child, callback, shadowRootAncestor);
    child = child.nextSibling;
  }
}

let inertManager = new InertManager(document);
Object.defineProperty(Element.prototype, 'inert', {
                        enumerable: true,
                        get: function() { return this.hasAttribute('inert'); },
                        set: function(inert) { inertManager.setInert(this, inert) }
                      });

let style = document.createElement('style');
style.textContent = "\n"+
                    "[inert] {\n" +
                    "  pointer-events: none;\n" +
                    "  cursor: default;\n" +
                    "}\n" +
                    "\n" +
                    "[inert], [inert] * {\n" +
                    "  user-select: none;\n" +
                    "  -webkit-user-select: none;\n" +
                    "  -moz-user-select: none;\n" +
                    "  -ms-user-select: none;\n" +
                    "}\n";

document.body.appendChild(style);

})(document);

import { NsFallback, getFallback, ObserverOptionsInternal } from '@tolgee/core'
import { KeyAndParams, TranslationOnClick } from '@tolgee/core'
import {
  I18N_RESTRICT_ATTRIBUTE,
  I18N_ATTRIBUTE_NAME,
  I18N_WRAPPED_ONLY_DATA_ATTRIBUTE,
} from '../constants'

import { ElementHighlighter } from './element-highlighter'
import { initElementMeta } from './element-meta'
import { ElementStoreType } from './element-store'
import { compareDescriptors } from './helper'
import { MouseEventHandler } from './mouse-event-handler'

export function ElementRegistry(
  options: ObserverOptionsInternal,
  elementStore: ElementStoreType,
  onClick: TranslationOnClick
) {
  const elementHighlighter = ElementHighlighter({
    highlightColor: options.highlightColor,
    highlightWidth: options.highlightWidth,
  })
  const eventHandler = MouseEventHandler({
    highlightKeys: options.highlightKeys,
    elementStore,
    onClick(el) {
      const meta = elementStore.get(el)!
      onClick({
        target: el as HTMLElement,
        keysAndDefaults: getKeysAndDefaults(meta),
      })
    },
    options,
  })

  function isRestricted(element: Element) {
    const restrictedElements = options.restrictedElements
    return (
      restrictedElements.indexOf(element.tagName.toLowerCase()) !== -1 ||
      element.closest(`[${I18N_RESTRICT_ATTRIBUTE}]`) !== null
    )
  }

  function cleanElementInactiveNodes(
    meta: ElementMeta,
    removedNodes: Set<Node>
  ) {
    for (const [key] of meta.nodes) {
      if (removedNodes.has(key)) {
        meta.nodes.delete(key)
      }
    }
  }

  function cleanElement(element: I18nElement, meta: ElementMeta) {
    if (meta.highlightEl) {
      meta.unhighlight?.()
    }
    element.removeAttribute(I18N_ATTRIBUTE_NAME)
    elementStore.remove(element)
  }

  function getKeyOptions(meta: ElementMeta): KeyAndParams[] {
    const nodes = Array.from(meta.nodes.values())
    return nodes.reduce(
      (acc, curr) => [
        ...acc,
        ...curr.keys.map((k) => ({
          key: k.key,
          defaultValue: k.defaultValue,
          ns: k.ns,
        })),
      ],
      [] as KeyAndParams[]
    )
  }

  function getKeysAndDefaults(meta: ElementMeta): KeyAndParams[] {
    return getKeyOptions(meta)
  }

  return Object.freeze({
    register(element: Element, node: Node, nodeMeta: NodeMeta) {
      if (isRestricted(element)) {
        return
      }
      const I18nElement = element as I18nElement
      let elementMeta = elementStore.get(I18nElement)
      if (!elementMeta) {
        elementMeta = initElementMeta(I18nElement)
        elementStore.set(I18nElement, elementMeta)
        I18nElement.setAttribute(I18N_ATTRIBUTE_NAME, 'true')
      }
      elementMeta.nodes.set(node, nodeMeta)
      elementHighlighter.initHighlighter(I18nElement, elementMeta)
    },

    forEachElement: elementStore.forEachElement,

    cleanupLingeringKeyAttributes() {
      elementStore.forEachElement((element, meta) => {
        if (meta.preventClean) {
          return
        }
        for (const [node] of meta.nodes) {
          if (node.nodeType === Node.ATTRIBUTE_NODE) {
            const attr = node as Attr
            if (
              attr.name === I18N_WRAPPED_ONLY_DATA_ATTRIBUTE &&
              attr.ownerElement === null
            ) {
              meta.nodes.delete(attr)
            }
          }
        }
        if (meta.nodes.size === 0) {
          cleanElement(element, meta)
        }
      })
    },

    cleanupRemovedNodes(removedNodes: Set<Node>) {
      elementStore.forEachElement((element, meta) => {
        if (meta.preventClean) {
          return
        }
        if (!removedNodes.has(element)) {
          cleanElementInactiveNodes(meta, removedNodes)
        }
        if (removedNodes.has(element) || meta.nodes.size === 0) {
          cleanElement(element, meta)
        }
      })
    },

    findAll(key?: string, ns?: NsFallback) {
      const result: ElementMeta[] = []
      elementStore.forEachElement((_, meta) => {
        for (const nodeMeta of meta.nodes.values()) {
          const fits = nodeMeta.keys.find((val) =>
            compareDescriptors(
              { key, ns: getFallback(ns) },
              { key: val.key, ns: getFallback(val.ns) }
            )
          )
          if (fits) {
            result.push(meta)
            break
          }
        }
      })
      return result
    },

    run(mouseHighlight: boolean) {
      if (mouseHighlight) {
        eventHandler.run()
      }
    },

    stop() {
      eventHandler.stop()
      elementStore.forEachElement((_, meta) => {
        if (meta.highlightEl) {
          meta.unhighlight?.()
        }
      })
    },
  })
}

export type ElementRegistryInstance = ReturnType<typeof ElementRegistry>

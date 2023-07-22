// Composables
import { useDisplay } from '@/composables/display'
import { useResizeObserver } from '@/composables/resizeObserver'

// Utilities
import { computed, ref, shallowRef, watch, watchEffect } from 'vue'
import {
  clamp,
  createRange,
  propsFactory,
} from '@/util'

// Types
import type { Ref } from 'vue'

const UP = -1
const DOWN = 1
const BUFFER_RATIO_RECEPROCAL = 3
const BUFFER_RATIO = 1 / BUFFER_RATIO_RECEPROCAL

type VirtualProps = {
  itemHeight?: number | string
}

export const makeVirtualProps = propsFactory({
  itemHeight: {
    type: [Number, String],
    default: 24,
  },
}, 'virtual')

export function useVirtual <T> (props: VirtualProps, items: Ref<readonly T[]>, offset?: Ref<number>) {
  const first = shallowRef(0)
  const baseItemHeight = shallowRef(props.itemHeight)
  const itemHeight = computed({
    get: () => parseInt(baseItemHeight.value ?? 0, 10),
    set (val) {
      baseItemHeight.value = val
    },
  })
  const containerRef = ref<HTMLElement>()
  const { resizeRef, contentRect } = useResizeObserver()
  watchEffect(() => {
    resizeRef.value = containerRef.value
  })
  const display = useDisplay()

  const sizeMap = new Map<any, number>()
  let sizes = Array.from<number | null>({ length: items.value.length })
  const visibleItems = computed(() => {
    const height = (
      !contentRect.value || containerRef.value === document.documentElement
        ? display.height.value
        : contentRect.value.height
    ) - (offset?.value ?? 0)
    return Math.ceil((height / itemHeight.value) * (1 + BUFFER_RATIO * 2) + 1)
  })

  function handleItemResize (index: number, height: number) {
    itemHeight.value = Math.max(itemHeight.value, height)
    sizes[index] = height
    sizeMap.set(items.value[index], height)
  }

  function calculateOffset (index: number) {
    return sizes.slice(0, index)
      .reduce((acc, val) => acc! + (val || itemHeight.value), 0)!
  }

  function calculateMidPointIndex (scrollTop: number) {
    const end = items.value.length

    let middle = 0
    let middleOffset = 0
    while (middleOffset < scrollTop && middle < end) {
      middleOffset += sizes[middle++] || itemHeight.value
    }

    return middle - 1
  }

  let lastScrollTop = 0
  function handleScroll () {
    if (!containerRef.value || !contentRect.value) return

    const height = containerRef.value.clientHeight
    const scrollTop = containerRef.value.scrollTop
    const direction = scrollTop < lastScrollTop ? UP : DOWN

    const midPointIndex = calculateMidPointIndex(scrollTop + height / 2)
    const buffer = Math.ceil(visibleItems.value * BUFFER_RATIO)
    const firstIndex = Math.ceil(midPointIndex - buffer * BUFFER_RATIO_RECEPROCAL / 2)
    if (direction === UP && midPointIndex <= first.value + buffer - 1) {
      first.value = clamp(firstIndex, 0, items.value.length)
    } else if (direction === DOWN && (midPointIndex >= first.value + buffer + 1)) {
      first.value = clamp(firstIndex, 0, items.value.length - visibleItems.value)
    }
    lastScrollTop = scrollTop
  }

  function scrollToIndex (index: number) {
    if (!containerRef.value) return

    const offset = calculateOffset(index)
    containerRef.value.scrollTop = offset
  }

  const last = computed(() => Math.min(items.value.length, first.value + visibleItems.value))
  const computedItems = computed(() => {
    return items.value.slice(first.value, last.value).map((item, index) => ({
      raw: item,
      index: index + first.value,
    }))
  })
  const paddingTop = computed(() => calculateOffset(first.value))
  const paddingBottom = computed(() => calculateOffset(items.value.length) - calculateOffset(last.value))

  watch(() => items.value.length, () => {
    sizes = createRange(items.value.length).map(() => itemHeight.value)
    sizeMap.forEach((height, item) => {
      const index = items.value.indexOf(item)
      if (index === -1) {
        sizeMap.delete(item)
      } else {
        sizes[index] = height
      }
    })
  })

  return {
    containerRef,
    computedItems,
    itemHeight,
    paddingTop,
    paddingBottom,
    scrollToIndex,
    handleScroll,
    handleItemResize,
  }
}
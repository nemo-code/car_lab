<template>
  <button
    class="btn"
    :class="`btn-${type}`"
    @click="handleClick"
    :disabled="disabled"
  >
    <slot></slot>
  </button>
</template>

<script>
export default {
  name: "Button",
  props: {
    type: {
      type: String,
      default: "default"
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ["click"],
  methods: {
    handleClick(e) {
      this.$emit("click", e);
    }
  }
};
</script>

<style scoped>
.btn {
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/* Primary 主按钮（匹配 UI 第三四列的深蓝色按钮）*/
.btn-primary {
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  color: #ffffff;
  padding: 14px 32px;
  font-size: 16px;
  border-radius: 50px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.25);
}

/*  Default 次按钮（匹配 UI 第二列卡片下的按钮） */
.btn-default {
  background: #e0f2fe;
  color: #000000;
  padding: 12px 28px;
  font-size: 15px;
  border-radius: 50px;
}
.btn-default:hover {
  transform: translateY(-2px);
  background: #9bd6f6;
  border-color: #5f99f5;
}
</style>

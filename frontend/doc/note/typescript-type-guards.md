# React 重构笔记：精通 TypeScript 类型守卫 (Type Guards)

本文档旨在深入解析 TypeScript 中一个极其重要的安全特性——**类型守卫 (Type Guard)**。在我们处理来自 Go 后端的、类型未知的 `error` 对象时，这个技术是保证代码健壮性的关键。

## 1. 问题背景：`unknown` 类型的挑战

在 TypeScript 中，为了保证类型安全，`try...catch` 块中捕获的 `error` 变量，其默认类型是 `unknown`。

```tsx
try {
  // ...
} catch (error) {
  // 在这里，TypeScript 不知道 error 是什么，只知道它是 "unknown"
  console.log(error.message) // <-- TypeScript 会报错！
}
```

`unknown` 意味着“这是一个我完全不了解的值”。TypeScript 会阻止你对它进行任何操作，直到你向它**证明**了这个值的具体类型。

## 2. 错误的解决方案：`any` 类型断言

一个常见但**极其危险**的“修复”方式是使用 `any` 类型断言：

```tsx
// 危险！不推荐！
const fingerprint = (error as any).data?.Fingerprint
```

这相当于在告诉 TypeScript：“别管了，我知道它是什么，关闭所有类型检查”。这虽然能让编译通过，但完全牺牲了 TypeScript 带来的所有安全保障，很容易在运行时导致 `undefined is not a function` 这样的致命错误。

## 3. 最佳实践：使用类型守卫进行“身份验证”

类型守卫是一个特殊的函数，它的唯一工作就是在**运行时**对一个未知类型的值进行检查，并向 TypeScript 编译器**“担保”**它的具体类型。

### 类型守卫的“契约”

一个类型守卫函数必须满足两个条件：

1. 它接收一个 `unknown` (或其他) 类型的参数。
2. 它的返回值类型被注解为 `value is Type` 的形式。这里的 `is` 是一个特殊的关键字。

### 我们的 `isHostKeyVerificationError` 守卫

我们来分析一下我们自己实现的、用于检查后端错误的类型守卫。

#### **第一步：定义我们期望的类型接口**

```typescript
interface HostKeyVerificationError {
  data: {
    Fingerprint: string
    HostAddress: string
  }
}
```

#### **第二步：编写类型守卫函数**

```typescript
function isHostKeyVerificationError(
  error: unknown
): error is HostKeyVerificationError {
  // 1. 检查 error 是否是一个非 null 的对象
  if (typeof error !== 'object' || error === null) {
    return false
  }

  // 2. 检查这个对象上是否有一个名为 'data' 的属性
  if (!('data' in error)) {
    return false
  }

  // 3. 此时 TypeScript 知道 error 是一个包含 'data' 属性的对象。
  //    我们将其类型断言为一个更具体的、但仍然安全的类型。
  const data = (error as { data: unknown }).data

  // 4. 再检查 data 内部的结构
  if (typeof data !== 'object' || data === null) {
    return false
  }

  // 5. 最终检查，确保所有需要的属性都存在且类型正确
  return (
    'Fingerprint' in data &&
    typeof (data as { Fingerprint: unknown }).Fingerprint === 'string' &&
    'HostAddress' in data &&
    typeof (data as { HostAddress: unknown }).HostAddress === 'string'
  )
}
```

### 如何使用类型守卫

类型守卫最强大的地方在于它与 `if` 语句的结合。

```tsx
// 在 handleConnect 函数中
} catch (error) {
  // 使用类型守卫
  if (isHostKeyVerificationError(error)) {
    // 在这个 if 代码块内部，TypeScript 已经完全“相信”了我们的担保。
    // 它现在确切地知道，error 的类型就是 HostKeyVerificationError。

    // 因此，我们可以安全地、无需 `any` 地、并获得完整代码提示地访问它的属性！
    const { Fingerprint, HostAddress } = error.data;

    // ... 后续逻辑 ...
  } else {
    // 在这个 else 块中，TypeScript 知道 error 不是我们期望的类型
  }
}
```

### 总结

类型守卫是连接 TypeScript **编译时**类型系统和 JavaScript **运行时**动态特性的一座重要桥梁。通过编写类型守卫，我们可以在保证代码绝对类型安全的前提下，优雅地处理来自外部的、不可预测的数据结构。

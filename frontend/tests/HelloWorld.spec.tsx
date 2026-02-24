import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HelloWorld from "@/examples/test/HelloWorld.tsx";

test('renders name', async () => {
    render(<HelloWorld name="Vitest" />)

    // 使用 Vitest 的原生断言
    expect(screen.getByText('Hello Vitest x1!')).toBeDefined()
    
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Increment' }))

    expect(screen.getByText('Hello Vitest x2!')).toBeDefined()
})

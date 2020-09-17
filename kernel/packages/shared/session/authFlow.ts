import { login, signup, signupAgree, signupForm } from './actions'
import { StoreContainer } from '../store/rootTypes'

declare const globalThis: StoreContainer

export function setupAuthFlow() {
  const element = document.getElementById('eth-login')
  if (element) {
    element.style.display = 'block'
    const btnSignup = document.getElementById('btnSignUp')
    if (btnSignup) {
      const signupFlow = document.getElementById('signup-flow')
      const signupStep2 = document.getElementById('signup-step2')
      const signupStep3 = document.getElementById('signup-step3')
      const signupStep4 = document.getElementById('signup-step4')
      const btnSignupBack = document.getElementById('btnSignupBack')
      const btnSignupAgree = document.getElementById('btnSignupAgree')

      const form = document.getElementById('signup-form') as HTMLFormElement

      signupFlow!.style.display = 'none'
      signupStep2!.style.display = 'none'
      signupStep3!.style.display = 'none'
      signupStep4!.style.display = 'none'

      btnSignup.addEventListener('click', () => {
        signupFlow!.style.display = 'block'
        signupStep2!.style.display = 'block'
      })

      btnSignupBack!.addEventListener('click', () => {
        signupStep3!.style.display = 'none'
        signupStep2!.style.display = 'block'
      })
      btnSignupAgree!.addEventListener('click', () => {
        console.log('SIGNUP-AGREE')

        globalThis.globalStore.dispatch(signupAgree())

        signupStep3!.style.display = 'none'
        signupStep4!.style.display = 'block'
      })

      document.querySelector('.btnSignupWallet')!.addEventListener('click', (event: any) => {
        const provider = event.target.getAttribute('rel')
        console.log('SIGNUP-CHOOSE_WALLET: ', provider)
        globalThis.globalStore.dispatch(signup(provider))
      })

      form!.addEventListener('submit', (event) => {
        event.preventDefault()
        const formData = new FormData(form)
        const name = formData.get('name') as string
        const email = formData.get('email') as string

        console.log('SIGNUP-FORM-DATA: ', { name, email })

        globalThis.globalStore.dispatch(signupForm({ profile: { name, email } }))

        signupStep2!.style.display = 'none'
        signupStep3!.style.display = 'block'
        return false
      })
    }
    const btnLogin = document.getElementById('eth-login-confirm-button')
    if (btnLogin) {
      const handleLoginClick = (e: any) => {
        const provider = e.target.getAttribute('rel') || 'metamask'
        globalThis.globalStore.dispatch(login(provider))
        const unsubscribe = globalThis.globalStore.subscribe(() => {
          if (globalThis.globalStore.getState().session.initialized) {
            element.style.display = 'none'
            unsubscribe()
          }
        })
      }
      btnLogin!.addEventListener('click', handleLoginClick)
    }
  }
}

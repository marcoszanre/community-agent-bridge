import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export type OnboardingStep = 'welcome' | 'acs-setup' | 'agent-setup' | 'complete'

interface OnboardingState {
  // Whether onboarding has been completed
  hasCompletedOnboarding: boolean
  
  // Current step in the onboarding wizard
  currentStep: OnboardingStep
  
  // Track which steps have been completed
  completedSteps: OnboardingStep[]
  
  // Whether the user has skipped onboarding
  hasSkipped: boolean
  
  // Actions
  setCurrentStep: (step: OnboardingStep) => void
  completeStep: (step: OnboardingStep) => void
  completeOnboarding: () => void
  skipOnboarding: () => void
  resetOnboarding: () => void
  
  // Getters
  isStepCompleted: (step: OnboardingStep) => boolean
  getNextStep: () => OnboardingStep | null
  getPreviousStep: () => OnboardingStep | null
}

const stepOrder: OnboardingStep[] = ['welcome', 'acs-setup', 'agent-setup', 'complete']

export const useOnboardingStore = create<OnboardingState>()(
  devtools(
    persist(
      (set, get) => ({
        hasCompletedOnboarding: false,
        currentStep: 'welcome',
        completedSteps: [],
        hasSkipped: false,

        setCurrentStep: (step) => set(
          { currentStep: step },
          false,
          'setCurrentStep'
        ),

        completeStep: (step) => set(
          (state) => ({
            completedSteps: state.completedSteps.includes(step)
              ? state.completedSteps
              : [...state.completedSteps, step]
          }),
          false,
          'completeStep'
        ),

        completeOnboarding: () => set(
          {
            hasCompletedOnboarding: true,
            currentStep: 'complete',
            completedSteps: [...stepOrder]
          },
          false,
          'completeOnboarding'
        ),

        skipOnboarding: () => set(
          {
            hasCompletedOnboarding: true,
            hasSkipped: true
          },
          false,
          'skipOnboarding'
        ),

        resetOnboarding: () => set(
          {
            hasCompletedOnboarding: false,
            currentStep: 'welcome',
            completedSteps: [],
            hasSkipped: false
          },
          false,
          'resetOnboarding'
        ),

        isStepCompleted: (step) => {
          return get().completedSteps.includes(step)
        },

        getNextStep: () => {
          const { currentStep } = get()
          const currentIndex = stepOrder.indexOf(currentStep)
          if (currentIndex < stepOrder.length - 1) {
            return stepOrder[currentIndex + 1]
          }
          return null
        },

        getPreviousStep: () => {
          const { currentStep } = get()
          const currentIndex = stepOrder.indexOf(currentStep)
          if (currentIndex > 0) {
            return stepOrder[currentIndex - 1]
          }
          return null
        }
      }),
      {
        name: 'onboarding-store',
        partialize: (state) => ({
          hasCompletedOnboarding: state.hasCompletedOnboarding,
          completedSteps: state.completedSteps,
          hasSkipped: state.hasSkipped
        })
      }
    ),
    { name: 'onboarding-store' }
  )
)

import { createStore } from "solid-js/store";

export interface AccountFormValues {
  name: string;
  balance: string;
  offbudget: boolean;
}

export interface AccountFormErrors {
  name?: { message: string };
}

export function useAccountForm() {
  const [values, setValues] = createStore<AccountFormValues>({
    name: "",
    balance: "",
    offbudget: false,
  });
  const [errors, setErrors] = createStore<AccountFormErrors>({});

  function validate(): boolean {
    const trimmed = values.name.trim();
    if (!trimmed) {
      setErrors("name", { message: "Account name is required" });
      return false;
    }
    setErrors("name", undefined!);
    return true;
  }

  function resetForm() {
    setValues({ name: "", balance: "", offbudget: false });
    setErrors("name", undefined!);
  }

  return { values, errors, setValues, validate, resetForm };
}

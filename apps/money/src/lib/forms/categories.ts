import { createStore } from "solid-js/store";

export interface CategoryFormValues {
  name: string;
}

export interface CategoryFormErrors {
  name?: { message: string };
}

export interface CategoryGroupFormValues {
  name: string;
  isIncome: boolean;
}

export function useCategoryForm() {
  const [values, setValues] = createStore<CategoryFormValues>({ name: "" });
  const [errors, setErrors] = createStore<CategoryFormErrors>({});

  function validate(): boolean {
    const trimmed = values.name.trim();
    if (!trimmed) {
      setErrors("name", { message: "Category name is required" });
      return false;
    }
    setErrors("name", undefined!);
    return true;
  }

  function resetForm() {
    setValues("name", "");
    setErrors("name", undefined!);
  }

  return { values, errors, setValues, validate, resetForm };
}

export function useCategoryGroupForm() {
  const [values, setValues] = createStore<CategoryGroupFormValues>({
    name: "",
    isIncome: false,
  });
  const [errors, setErrors] = createStore<CategoryFormErrors>({});

  function validate(): boolean {
    const trimmed = values.name.trim();
    if (!trimmed) {
      setErrors("name", { message: "Group name is required" });
      return false;
    }
    setErrors("name", undefined!);
    return true;
  }

  function resetForm() {
    setValues({ name: "", isIncome: false });
    setErrors("name", undefined!);
  }

  return { values, errors, setValues, validate, resetForm };
}

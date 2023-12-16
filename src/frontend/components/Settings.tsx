import {type ReactNode, useEffect, useState} from 'react';
import {ipcRenderer} from "electron";
import {Config} from '../../common/configTypes';
import React from 'react';
import {
    type FieldPath,
    type FieldArrayPath,
    FormProvider,
    useFieldArray,
    useForm,
    useFormContext,
    type FieldPathByValue,
    type FieldValues,
    type FieldArray
} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {ErrorMessage} from "@hookform/error-message";

export default function Settings() {
    const [loadError, setLoadError] = useState('');
    const form = useForm({
        resolver: zodResolver(Config),
        defaultValues: async () => {
            try {
                return await Config.parseAsync(await ipcRenderer.invoke('config:get'));
            } catch(e) {
                setLoadError(e instanceof Error ? e.message : e+'');
                throw e;
            }
        }
    });
    const {
        control,
        reset,
        register,
        setValue,
        resetField,
        handleSubmit,
        getValues,
        formState: { errors, isValid, isDirty, isSubmitting, dirtyFields, isLoading }
    } = form;
    const { append: appendRule } = useFieldArray({ control: control, name: "rules", });
    const onSubmit = handleSubmit(
        async data => {
            console.log("submit", data);
            await ipcRenderer.invoke('config:set', data);
            reset(data);
        }
    );

    if (loadError) return <>{loadError}</>;
    if (isLoading) return <>Loading configuration ...</>;

    return <FormProvider {...form}><form onSubmit={onSubmit} className="settings"><fieldset disabled={isSubmitting}>
        <h1>Intiface</h1>
        <label>Intiface Server Port or IP:Port</label>
        <Field name="outputs.intiface.address" placeholder="Default: 12345" />

        <h1>VRChat</h1>
        <label>Forward OSC Data to Port or IP:Port</label>
        <FieldArray name="sources.vrchat.proxy">{name =>
            <Field name={`${name}.address`} placeholder="Ex: 9002 or 192.168.0.5:9000"/>
        }</FieldArray>

        <h1>Rules</h1>
        <FieldArray name="rules">{name => {
            const conditions = <FieldArray name={`${name}.conditions`}>{conditionId => {
                const conditionType = getValues(`${conditionId}.type`);
                return <div>Condition {conditionType}</div>;
            }}</FieldArray>;
            const type = getValues(`${name}.action.type`);
            return <>
                <div>Rule {name}</div>
                <div>Conditions:</div>
                {conditions}
                <div>Action: {type}</div>
            </>;
        }}</FieldArray>
        <input type="button" onClick={_ => appendRule({action: {type: "scale"}} as any)} value="Add Scale Rule"/>

        {isDirty && <input type="submit" value="Save"/>}
        {Object.keys(errors).length > 0 && <span style={{whiteSpace: 'pre-wrap'}}>
            Error:
            {JSON.stringify(errors, null, 2)}
        </span>}

    </fieldset></form></FormProvider>;
}

/*
function DeviceEditor<T extends FieldValues>({name}: {
    name: FieldPathByValue<T, DeviceConfig>
}) {

}
 */

function Field({name, placeholder}: {
    name: FieldPath<Config>,
    placeholder?: string
}) {
    const {register, formState: { errors }} = useFormContext<Config>();
    return <>
        <input {...register(name) } placeholder={placeholder} />
        <ErrorMessage
            errors={errors}
            name={name}
            render={({ message }) => <div className="error">{message}</div>}
        />
    </>;
}

function FieldArray<P extends FieldArrayPath<Config>>({name, children}: {
    name: P,
    children: (path: `${P}.${number}`) => ReactNode
}) {
    const {control} = useFormContext<Config>();
    const {
        fields,
        append,
        remove
    } = useFieldArray({
        control: control,
        name: name,
    });
    return <>
        {fields.map((field, index) =>
            <div className="listItem" key={field.id}>
                {children(`${name}.${index}`)}
                <div className="remove" onClick={() => remove(index)}>
                    X
                </div>
            </div>
        )}
        <div>
            <input type="button" onClick={_ => append({} as any)} value="Add"/>
        </div>
    </>;
}
